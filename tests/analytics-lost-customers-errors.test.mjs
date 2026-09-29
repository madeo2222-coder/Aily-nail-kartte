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
  readFileSync(new URL("../app/analytics/lost-custmers/page.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
).outputText;

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ["2026-09-28T00:00:00Z"]));
  }
}

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
      ? {
          data: [{
            id: "c1",
            name: "顧客A",
            phone: "090-0000-0000",
            line: "line-a",
            created_at: "2026-09-01T00:00:00Z",
          }],
          error: null,
        }
      : {
          data: [{
            id: "v1",
            customer_id: "c1",
            created_at: "2026-09-20T00:00:00Z",
            price: 8000,
          }],
          error: null,
        };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date: FixedDate,
    Intl,
    Map,
    Number,
    Promise,
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          assert.ok(table === "customers" || table === "visits");
          const query = { table, select: "", orders: [] };
          queries.push(query);
          const chain = {
            select(value) { query.select = value; return chain; },
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
      await setImmediate();
    },
  };
}

for (const failureTable of ["customers", "visits"]) {
  test(`legacy lost-customer analytics blocks incomplete data when ${failureTable} fails`, async () => {
    const page = await mount({ failureTable });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(page.html(), /対象顧客数|累計売上|予約登録|顧客を検索/);
    page.unmount();
  });
}

test("legacy lost-customer analytics handles rejection and recovers on retry", async () => {
  const page = await mount({ failureTable: "visits", rejection: true });
  assert.match(page.html(), /失客アラートのデータを取得できませんでした/);
  assert.doesNotMatch(page.html(), /予約登録/);
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /¥8,000/);
  assert.equal(page.queries.length, 4);
  page.unmount();
});

test("legacy lost-customer analytics preserves a legitimate empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /対象顧客数/);
  assert.match(page.html(), /対象の顧客がいません/);
  page.unmount();
});

test("legacy lost-customer analytics renders complete customer and visit data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /来店回数:<\/span> 1回/);
  assert.match(page.html(), /¥8,000/);
  assert.match(page.html(), /予約登録/);
  assert.equal(page.queries.length, 2);
  page.unmount();
});
