import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/visits/[id]/edit/page.tsx", import.meta.url),
  "utf8"
);

function createQuery(table) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    order() { return Promise.resolve({ data: [], error: null }); },
    single() {
      if (table === "visits") {
        return Promise.resolve({
          data: {
            id: "visit-1",
            customer_id: null,
            visit_date: "2026-09-27",
            menu: "ワンカラー",
            menu_name: null,
            color: "ピンク",
            memo: null,
            price: 5000,
            payment_method: "現金",
            created_at: "2026-09-27T00:00:00",
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return chain;
}

async function mount() {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let tree;
  let nextUrl = 0;
  const active = new Set();
  const revoked = [];

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) {
        slots[index] = typeof initial === "function" ? initial() : initial;
      }
      return [slots[index], value => {
        if (typeof value === "function") {
          const previous = slots[index];
          value(previous);
          slots[index] = value(previous);
        } else {
          slots[index] = value;
        }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      const changed = !previous || deps.some((value, i) => !Object.is(value, previous.deps[i]));
      if (changed) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };

  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    console,
    URL: {
      createObjectURL() {
        const url = `blob:edit-${++nextUrl}`;
        active.add(url);
        return url;
      },
      revokeObjectURL(url) {
        revoked.push(url);
        active.delete(url);
      },
    },
    alert() {},
    confirm() { return false; },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") {
        return {
          useParams: () => ({ id: "visit-1" }),
          useRouter: () => ({ push() { throw new Error("Unexpected navigation"); } }),
        };
      }
      if (name === "@/lib/supabase") {
        return { supabase: { from: createQuery } };
      }
      if (name === "./VisitEditPhoto") return { default: "img" };
      throw new Error(`Unexpected import: ${name}`);
    },
  }, { filename: "visit-edit-page.js" });

  function render() {
    cursor = 0;
    tree = exports.default();
    const effects = pendingEffects;
    pendingEffects = [];
    effects.forEach(effect => effect());
  }

  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    return [node, ...nodes(node.props?.children ?? null)];
  }

  render();
  await setImmediate();
  render();

  return {
    active,
    revoked,
    select(files) {
      const input = nodes().find(node => node.props?.type === "file");
      assert.ok(input, "file input should be rendered after visit lookup");
      input.props.onChange({ target: { files } });
      render();
    },
    removeFirst() {
      const button = nodes().find(node => node.type === "button" && node.props?.children === "追加をやめる");
      assert.ok(button, "new-photo remove button should be rendered");
      button.props.onClick();
      render();
    },
    unmount() {
      slots.forEach(slot => slot?.cleanup?.());
    },
  };
}

test("removing one newly selected photo keeps the other preview alive", async () => {
  const page = await mount();
  page.select([{ type: "image/png" }, { type: "image/jpeg" }]);
  assert.deepEqual([...page.active], ["blob:edit-1", "blob:edit-2"]);

  page.removeFirst();
  assert.deepEqual([...page.active], ["blob:edit-2"]);
  assert.deepEqual(page.revoked, ["blob:edit-1"]);

  page.unmount();
  assert.equal(page.active.size, 0);
  assert.deepEqual(page.revoked, ["blob:edit-1", "blob:edit-2"]);
});

test("replacing a selection releases the old previews and keeps the replacement", async () => {
  const page = await mount();
  page.select([{ type: "image/png" }, { type: "image/jpeg" }]);
  page.select([{ type: "image/webp" }]);

  assert.deepEqual([...page.active], ["blob:edit-3"]);
  assert.deepEqual(page.revoked, ["blob:edit-1", "blob:edit-2"]);

  page.unmount();
  assert.deepEqual(page.revoked, ["blob:edit-1", "blob:edit-2", "blob:edit-3"]);
});
