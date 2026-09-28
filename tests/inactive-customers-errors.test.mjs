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
  readFileSync(new URL("../app/customers/inactive/page.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
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

async function mount({ failureTable = "", rejection = false, empty = false, pauseVisit = false } = {}) {
  let releaseVisit;
  const states = [];
  let cursor = 0;
  let effect;
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
    useCallback: fn => fn,
    useEffect: fn => { effect = fn; },
  };

  function response(table, customerId) {
    if (shouldFail && failureTable === table && (table === "customers" || customerId === "old")) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }
    if (empty) return { data: [], error: null };
    if (table === "visits") return { data: customerId === "never" ? [] : [
      { visit_date: customerId === "old" ? "2026-08-01" : "2026-09-27" },
    ], error: null };
    return { data: [
      { id: "never", name: "未訪問A" },
      { id: "old", name: "過去来店B" },
      { id: "recent", name: "最近来店C" },
    ], error: null };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date: FixedDate,
    Map,
    Number,
    Promise,
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "next/link") return { default: "a" };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          assert.ok(["customers", "visits"].includes(table));
          let customerId;
          const query = { table, select: "", filters: [], orders: [] };
          queries.push(query);
          const chain = {
            select(value) { query.select = value; return chain; },
            eq(column, value) {
              customerId = value;
              query.filters.push([column, value]);
              return chain;
            },
            order(column, options) {
              query.orders.push([column, options]);
              return chain;
            },
            limit(value) { query.limit = value; return chain; },
            then(resolve, reject) {
              if (pauseVisit && table === "visits") {
                return new Promise(done => { releaseVisit = done; })
                  .then(() => response(table, customerId)).then(resolve, reject);
              }
              return Promise.resolve().then(() => response(table, customerId)).then(resolve, reject);
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
  const cleanup = effect();
  await setImmediate();

  return {
    queries,
    html,
    async unmountDuringVisit() {
      assert.ok(releaseVisit);
      cleanup();
      releaseVisit();
      await setImmediate();
    },
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
  for (const rejection of [false, true]) {
    test(`inactive customers blocks partial results after ${failureTable} ${rejection ? "rejection" : "query error"} and retries`, async () => {
      const page = await mount({ failureTable, rejection });
      assert.match(page.html(), /role="alert"/);
      assert.doesNotMatch(page.html(), /未回来店の顧客はいません|最終来店:|未訪問A|過去来店B|読み込み中/);
      assert.equal(page.queries.length, failureTable === "customers" ? 1 : 3);
      await page.retry();
      assert.doesNotMatch(page.html(), /role="alert"|最近来店C/);
      assert.match(page.html(), /未訪問A/);
      assert.match(page.html(), /過去来店B/);
    });
  }
}

test("inactive customers preserves valid no-visit and old-visit results but excludes recent visits", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|最近来店C/);
  assert.match(page.html(), /未訪問A/);
  assert.match(page.html(), /最終来店: なし/);
  assert.match(page.html(), /過去来店B/);
  assert.match(page.html(), /2026-08-01/);
  for (const query of page.queries.filter(q => q.table === "visits")) {
    assert.equal(query.select, "visit_date");
    assert.equal(query.limit, 1);
    assert.equal(query.orders[0][0], "visit_date");
    assert.equal(query.orders[0][1].ascending, false);
  }
});

test("inactive customers distinguishes successful empty data from failure", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /未回来店の顧客はいません/);
  assert.equal(page.queries.length, 1);
});

test("inactive customers stops remaining lookups after unmount", async () => {
  const page = await mount({ pauseVisit: true });
  assert.equal(page.queries.length, 2);
  await page.unmountDuringVisit();
  assert.equal(page.queries.length, 2);
});
