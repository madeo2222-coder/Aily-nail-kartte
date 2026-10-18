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
  readFileSync(new URL("../app/reports/kpi/page.tsx", import.meta.url), "utf8"),
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
  let effect;
  let cleanup;
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
    useEffect: fn => { effect = fn; },
  };

  function response(table) {
    if (shouldFail && failureTable === table) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }
    if (empty) return { data: [], error: null };
    return table === "customers"
      ? { data: [{ id: "c1", name: "顧客A" }], error: null }
      : {
          data: [{
            id: "v1",
            customer_id: "c1",
            visit_date: "2026-09-20",
            amount: 8000,
            customers: { id: "c1", name: "顧客A" },
          }],
          error: null,
        };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    console: { error() {} },
    Promise,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          assert.ok(table === "customers" || table === "visits");
          const query = { table, select: "", orders: [] };
          queries.push(query);
          const chain = {
            select(value) {
              query.select = value;
              if (table === "customers") return Promise.resolve().then(() => response(table));
              return chain;
            },
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

  function tree() { cursor = 0; return exports.default(); }
  function html() { return renderToStaticMarkup(tree()); }
  tree();
  cleanup = effect();
  await setImmediate();

  return {
    queries,
    html,
    unmount() { cleanup?.(); },
    async retry() {
      const button = findNode(tree(), node => node.type === "button" && node.props.children === "再試行");
      assert.ok(button);
      shouldFail = false;
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
  };
}

for (const failureTable of ["customers", "visits"]) {
  test(`KPI report hides incomplete totals when ${failureTable} query fails`, async () => {
    const page = await mount({ failureTable });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /KPIデータを取得できませんでした/);
    assert.doesNotMatch(page.html(), /総顧客数|総来店数|総売上|集計できる来店データ/);
  });
}

test("KPI report handles a rejected query and recovers on retry", async () => {
  const page = await mount({ failureTable: "visits", rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /総売上/);
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /総顧客数/);
  assert.match(page.html(), /¥8,000/);
  assert.equal(page.queries.length, 4);
});

test("KPI report keeps legitimate zero totals for successful empty data", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /総顧客数/);
  assert.match(page.html(), /集計できる来店データがまだありません/);
});
