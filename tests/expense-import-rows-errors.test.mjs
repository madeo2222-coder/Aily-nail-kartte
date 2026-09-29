import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(new URL("../app/expenses/import-rows/page.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
).outputText;

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function depsChanged(previous, deps) {
  return !previous || deps.some((value, index) => !Object.is(value, previous.deps[index]));
}

async function mount({ failure = "", empty = false } = {}) {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let tree;
  let currentFailure = failure;
  let queryCount = 0;

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (depsChanged(previous, deps)) slots[index] = { deps, value: fn };
      return slots[index].value;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (depsChanged(previous, deps)) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };

  const row = {
    id: "row-1",
    import_id: "import-1",
    expense_date: "2026-09-29",
    amount: 3800,
    vendor_raw: "備品店",
    description_raw: "消耗品",
    payment_method: "カード",
    receipt_status: "attached",
    review_status: "unreviewed",
    duplicate_flag: false,
    excluded_flag: false,
    created_at: "2026-09-29T00:00:00Z",
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Intl,
    Number,
    Promise,
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              assert.equal(table, "expense_import_rows");
              queryCount += 1;
              const chain = {
                select() { return chain; },
                eq() { return chain; },
                order() { return chain; },
                limit() {
                  return Promise.resolve().then(() => {
                    if (currentFailure === "rejection") throw new Error("offline");
                    if (currentFailure === "error") {
                      return { data: null, error: { message: "read failed" } };
                    }
                    return { data: empty ? [] : [row], error: null };
                  });
                },
              };
              return chain;
            },
          },
        };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function render() {
    cursor = 0;
    tree = exports.default();
    const effects = pendingEffects;
    pendingEffects = [];
    effects.forEach(effect => effect());
  }

  async function settle() {
    await setImmediate();
    await setImmediate();
    render();
  }

  render();
  await settle();

  return {
    html() { return renderToStaticMarkup(tree); },
    queryCount() { return queryCount; },
    async retry() {
      const button = findNode(tree, node => node.type === "button" && node.props?.children === "再試行");
      assert.ok(button, "retry button should be visible");
      currentFailure = "";
      button.props.onClick();
      await settle();
    },
    unmount() {
      slots.forEach(slot => slot?.cleanup?.());
    },
  };
}

for (const failure of ["error", "rejection"]) {
  test(`expense import candidates hide false empty output after ${failure}`, async () => {
    const page = await mount({ failure });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /CSV取込候補を取得できませんでした/);
    assert.doesNotMatch(page.html(), /CSV取込候補はありません|正式登録|>除外</);
    page.unmount();
  });
}

test("expense import candidates recover through one authoritative retry", async () => {
  const page = await mount({ failure: "error" });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /備品店/);
  assert.match(page.html(), /正式登録/);
  assert.match(page.html(), />除外</);
  assert.equal(page.queryCount(), 2);
  page.unmount();
});

test("expense import candidates preserve a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /CSV取込候補はありません/);
  assert.equal(page.queryCount(), 1);
  page.unmount();
});

test("expense import candidates render actions only for successful rows", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /¥3,800/);
  assert.match(page.html(), /備品店/);
  assert.match(page.html(), /正式登録/);
  assert.match(page.html(), />除外</);
  page.unmount();
});
