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
  readFileSync(new URL("../app/customer-app/page.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
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

async function mount({ failureTable = "", rejection = false, meOk = true } = {}) {
  const states = [];
  const queries = [];
  let cursor = 0;
  let effect;
  let shouldFail = Boolean(failureTable) || !meOk;

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
    useMemo: fn => fn(),
    useEffect: fn => { effect = fn; },
  };

  function queryResponse(table) {
    if (shouldFail && table === failureTable) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }
    return { data: [], error: null };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Intl,
    Map,
    Number,
    Promise,
    window: { setTimeout() {}, location: { href: "" } },
    console: { error() {} },
    fetch: async url => {
      assert.equal(url, "/api/line-login/me");
      if (shouldFail && !meOk) return { ok: false, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          authenticated: true,
          customer: { id: "customer-1", name: "顧客A", salon_id: null },
        }),
      };
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "./CustomerPhoto") return { default: () => null };
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          const query = { table, filters: [] };
          queries.push(query);
          const chain = {
            select() { return chain; },
            eq(column, value) { query.filters.push(["eq", column, value]); return chain; },
            neq(column, value) { query.filters.push(["neq", column, value]); return chain; },
            gte(column, value) { query.filters.push(["gte", column, value]); return chain; },
            not(column, operator, value) { query.filters.push(["not", column, operator, value]); return chain; },
            order() { return chain; },
            limit() { return chain; },
            maybeSingle() { return chain; },
            then(resolve, reject) {
              return Promise.resolve().then(() => queryResponse(table)).then(resolve, reject);
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
  effect();
  await setImmediate();

  return {
    queries,
    html,
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

for (const failureTable of ["visits", "reservations"]) {
  for (const rejection of [false, true]) {
    test(`customer home blocks false empty state after ${failureTable} ${rejection ? "rejection" : "query error"}`, async () => {
      const page = await mount({ failureTable, rejection });
      assert.match(page.html(), /role="alert"/);
      assert.doesNotMatch(page.html(), /そろそろご来店|初回ご予約をお待ちしています/);
      await page.retry();
      assert.doesNotMatch(page.html(), /role="alert"/);
      assert.match(page.html(), /初回ご予約をお待ちしています/);
    });
  }
}

test("customer home distinguishes successful empty history and reservations", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /こんにちは、顧客A様/);
  assert.match(page.html(), /初回ご予約をお待ちしています/);
  assert.equal(page.queries.filter(query => query.table === "reservations").length, 2);
});

test("customer home shows the load error before the logged-out prompt", async () => {
  const page = await mount({ meOk: false });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /LINEからのご来店ありがとうございます/);
});
