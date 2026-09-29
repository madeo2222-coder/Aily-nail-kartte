import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/visits/new/NewVisitPageClient.tsx", import.meta.url), "utf8");

// Execute the real page's event handlers and dependency-aware effect cleanup.
// No database or browser connection is used.
async function mount() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  let tree;
  const active = new Set();
  const revoked = [];
  let nextUrl = 0;
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => {
        // React may invoke state updaters twice in Strict Mode.
        if (typeof value === "function") { value(slots[i]); slots[i] = value(slots[i]); }
        else slots[i] = value;
      }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      const previous = slots[i];
      if (
        !previous ||
        deps.some((value, index) => !Object.is(value, previous.deps[index]))
      ) {
        slots[i] = { deps, value: fn };
      }
      return slots[i].value;
    },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) {
      const i = cursor++;
      const previous = slots[i];
      if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        pending.push(() => {
          previous?.cleanup?.();
          slots[i] = { deps, fn, cleanup: fn() };
        });
      }
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, console,
    URL: {
      createObjectURL() { const url = `blob:test-${++nextUrl}`; active.add(url); return url; },
      revokeObjectURL(url) { revoked.push(url); active.delete(url); },
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/image") return { default: "img" };
      if (name === "next/navigation") return {
        useRouter: () => ({ push() { throw new Error("Unexpected navigation"); } }),
        useSearchParams: () => ({ get: () => null }),
      };
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          assert.equal(table, "customers");
          return { select: () => ({ order: async () => ({
            data: [{ id: "customer-1", name: "顧客A", phone: null, salon_id: "salon-1" }],
            error: null,
          }) }) };
        },
      } };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  function render() {
    cursor = 0;
    tree = exports.default();
    for (const effect of pending) effect();
    pending = [];
  }
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    return [node, ...nodes(node.props?.children ?? null)];
  }
  render();
  await setImmediate();
  render();
  // Initial Strict Mode effect replay must not invalidate future selections.
  for (const slot of slots) if (slot?.fn) { slot.cleanup?.(); slot.cleanup = slot.fn(); }
  await setImmediate();
  render();
  return {
    active, revoked,
    add(types = ["image/png"]) {
      const input = nodes().find(node => node.props?.type === "file");
      input.props.onChange({ target: { files: types.map(type => ({ type })), value: "selected" } });
      render();
    },
    previewImages() {
      return nodes().filter(node => node.type === "img" && node.props?.alt === "施術後写真プレビュー");
    },
    removeFirst() {
      nodes().find(node => node.type === "button" && node.props.children === "削除").props.onClick();
      render();
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test("adding photos preserves earlier previews; removal only releases the selected URL", async () => {
  const page = await mount();
  page.add();
  page.add();
  assert.deepEqual([...page.active], ["blob:test-1", "blob:test-2"]);
  assert.deepEqual(page.revoked, []);
  assert.equal(page.previewImages().length, 2);
  assert.equal(page.previewImages()[0].props.fill, true);
  assert.equal(page.previewImages()[0].props.unoptimized, true);
  assert.equal(page.previewImages()[0].props.sizes, "(max-width: 640px) calc(50vw - 30px), 264px");
  page.removeFirst();
  assert.deepEqual([...page.active], ["blob:test-2"]);
  assert.deepEqual(page.revoked, ["blob:test-1"]);
  page.unmount();
  assert.equal(page.active.size, 0);
  assert.deepEqual(page.revoked, ["blob:test-1", "blob:test-2"]);
});

test("non-image and empty selections do not invalidate existing previews", async () => {
  const page = await mount();
  page.add();
  page.add(["text/plain"]);
  page.add([]);
  assert.deepEqual([...page.active], ["blob:test-1"]);
  assert.deepEqual(page.revoked, []);
  page.unmount();
  assert.deepEqual(page.revoked, ["blob:test-1"]);
});
