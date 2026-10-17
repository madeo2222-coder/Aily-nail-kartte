// Run: node --test tests/fetch-effects.test.mjs
// Executes the real client page fetch/effect flows with in-memory responses.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

function createHooks() {
  const states = [];
  const effects = [];
  let cursor = 0;

  return {
    effects,
    reset() { cursor = 0; },
    hooks: {
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value) => {
          states[index] = typeof value === "function" ? value(states[index]) : value;
        }];
      },
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
      useEffect: (fn) => { effects.push(fn); },
    },
  };
}

async function settleEffects(effects) {
  for (const effect of effects.splice(0)) effect();
  await setImmediate();
}

async function loadSalesPayments({ visitId = "visit-1", visit = {}, error = null } = {}) {
  const compiled = compile("../app/sales-payments/SalesPaymentsClient.tsx");
  const hookState = createHooks();
  const redirects = [];
  const queries = [];
  const router = { replace: (url) => redirects.push(url) };
  const supabase = {
    from(table) {
      assert.equal(table, "visits");
      const query = { table };
      queries.push(query);
      const chain = {
        select(value) { query.select = value; return chain; },
        eq(key, value) { query.eq = [key, value]; return chain; },
        async maybeSingle() {
          return {
            data: error ? null : {
              id: visitId,
              customer_id: "customer-1",
              visit_date: "2026-09-27T10:00:00",
              menu_name: "ワンカラー",
              staff_name: "テスト担当",
              memo: "次回確認",
              ...visit,
            },
            error,
          };
        },
      };
      return chain;
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return hookState.hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") return {
        useRouter: () => router,
        useSearchParams: () => ({ get: () => visitId }),
      };
      if (name === "@/lib/supabase") return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
    console,
    URLSearchParams,
  }, { filename: "sales-payments.js" });
  const render = () => {
    hookState.reset();
    return renderToStaticMarkup(exports.default());
  };
  render();
  await settleEffects(hookState.effects);
  return { html: render(), queries, redirects };
}

test("sales checkout reads the route visit once and redirects with its values", async () => {
  const { queries, redirects } = await loadSalesPayments();
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].eq, ["id", "visit-1"]);
  assert.equal(
    redirects[0],
    "/visits/new?customer_id=customer-1&visit_date=2026-09-27&menu_name=%E3%83%AF%E3%83%B3%E3%82%AB%E3%83%A9%E3%83%BC&staff_name=%E3%83%86%E3%82%B9%E3%83%88%E6%8B%85%E5%BD%93&memo=%E6%AC%A1%E5%9B%9E%E7%A2%BA%E8%AA%8D"
  );
});

test("sales checkout surfaces a visit lookup error without redirecting", async () => {
  const { html, redirects } = await loadSalesPayments({ error: { message: "read failed" } });
  assert.match(html, /来店情報を取得できませんでした/);
  assert.deepEqual(redirects, []);
});

async function loadExpenses({ rows = [], error = null } = {}) {
  const compiled = compile("../app/expenses/page.tsx");
  const hookState = createHooks();
  const queries = [];
  const alerts = [];
  const supabase = {
    from(table) {
      assert.equal(table, "expenses");
      const query = { table, orders: [] };
      queries.push(query);
      const chain = {
        select(value) { query.select = value; return chain; },
        order(column, options) { query.orders.push([column, options]); return chain; },
        then(resolve, reject) {
          return Promise.resolve({ data: error ? null : rows, error }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return hookState.hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
    console,
    alert: (message) => alerts.push(message),
    window: { print() {}, confirm: () => false },
    Date,
    Intl,
  }, { filename: "expenses-page.js" });
  const render = () => {
    hookState.reset();
    return renderToStaticMarkup(exports.default());
  };
  render();
  await settleEffects(hookState.effects);
  return { alerts, html: render(), queries };
}

test("expense list performs its canonical ordered query and renders current-month data", async () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const { html, queries } = await loadExpenses({ rows: [{
    id: "expense-1",
    expense_date: `${now.getFullYear()}-${month}-01`,
    category: "消耗品",
    amount: 1234,
    memo: "テスト購入",
    receipt_url: null,
  }] });
  assert.equal(queries.length, 1);
  assert.equal(queries[0].select, "id, expense_date, category, amount, memo, receipt_url");
  assert.deepEqual(
    queries[0].orders.map(([column, options]) => [column, options.ascending]),
    [["expense_date", false], ["id", false]]
  );
  assert.match(html, /消耗品/);
  assert.match(html, /テスト購入/);
  assert.match(html, /1,234/);
});

test("expense list clears stale rows and reports a read error", async () => {
  const { alerts, html } = await loadExpenses({ error: { message: "read failed" } });
  assert.deepEqual(alerts, ["経費一覧の取得に失敗しました: read failed"]);
  assert.match(html, /該当する経費がありません/);
});
