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
  readFileSync(new URL("../app/reservations/new/page.tsx", import.meta.url), "utf8"),
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

async function mount({ failureTable = "", rejection = false, empty = false } = {}) {
  const states = [];
  let cursor = 0;
  let effects = [];
  const cleanups = [];
  let shouldFail = Boolean(failureTable);
  const queries = [];

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useEffect: fn => { effects.push(fn); },
  };

  function response(table) {
    if (shouldFail && failureTable === table) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }
    if (empty) return { data: [], error: null };
    if (table === "salons") {
      return { data: [{ id: "s1", name: "Aily" }], error: null };
    }
    if (table === "customers") {
      return { data: [{ id: "c1", name: "顧客A", salon_id: "s1" }], error: null };
    }
    return { data: [{ id: "st1", name: "スタッフA", salon_id: "s1" }], error: null };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Intl,
    Number,
    Promise,
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") return { useRouter: () => ({ push() {} }) };
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          assert.ok(["salons", "customers", "staffs"].includes(table));
          const query = { table, select: "", filters: [], orders: [] };
          queries.push(query);
          const chain = {
            select(value) { query.select = value; return chain; },
            eq(column, value) { query.filters.push([column, value]); return chain; },
            order(column, options) {
              query.orders.push([column, options]);
              return Promise.resolve().then(() => response(table));
            },
          };
          return chain;
        },
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function tree() {
    cursor = 0;
    effects = [];
    return exports.default();
  }
  function html() { return renderToStaticMarkup(tree()); }

  tree();
  for (const effect of effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  await setImmediate();

  return {
    queries,
    html,
    unmount() { for (const cleanup of cleanups) cleanup(); },
    async retry() {
      const button = findNode(tree(), node => node.type === "button" && node.props.children === "再試行");
      assert.ok(button);
      shouldFail = false;
      button.props.onClick();
      await setImmediate();
    },
  };
}

for (const failureTable of ["salons", "customers", "staffs"]) {
  test(`reservation creation hides the form when ${failureTable} master data fails`, async () => {
    const page = await mount({ failureTable });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /一覧の取得に失敗しました/);
    assert.doesNotMatch(page.html(), /登録種別|登録内容確認|>登録する</);
    page.unmount();
  });
}

test("reservation creation handles a rejected master query and retries all sources", async () => {
  const page = await mount({ failureTable: "customers", rejection: true });
  assert.match(page.html(), /予約登録に必要なデータを取得できませんでした/);
  assert.doesNotMatch(page.html(), /登録内容確認/);
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /登録種別/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /スタッフA/);
  assert.equal(page.queries.length, 6);
  page.unmount();
});

test("reservation creation preserves authoritative empty master results", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /登録種別/);
  assert.match(page.html(), /選択してください/);
  assert.equal(page.queries.length, 3);
  page.unmount();
});

test("reservation creation renders complete master data only after every query succeeds", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /Aily/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /スタッフA/);
  assert.match(page.html(), /登録内容確認/);
  assert.equal(page.queries.length, 3);
  assert.deepEqual(page.queries.find(query => query.table === "staffs")?.filters, [
    ["role", "staff"],
    ["is_active", true],
  ]);
  page.unmount();
});
