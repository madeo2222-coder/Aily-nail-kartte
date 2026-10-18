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
      useRef(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = { current: initial };
        return states[index];
      },
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

async function loadExpenses({ rows = [], error = null, rejectQuery = false } = {}) {
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
          return (rejectQuery ? Promise.reject(new Error("offline")) : Promise.resolve({ data: error ? null : rows, error })).then(resolve, reject);
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
      if (name === "./ExpenseReceiptImage") {
        return {
          default: ({ src }) => require("react").createElement("img", {
            src,
            alt: "レシート",
          }),
        };
      }
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
  return { alerts, html: render(), queries, async retry() {
    hookState.reset();
    const tree = exports.default();
    function findRetry(node) {
      if (!node || typeof node !== "object") return null;
      if (node.type === "button" && node.props.children === "再試行") return node;
      for (const child of [node.props?.children].flat(Infinity)) {
        const found = findRetry(child);
        if (found) return found;
      }
      return null;
    }
    error = null;
    rejectQuery = false;
    const retry = findRetry(tree);
    assert.ok(retry, "retry button exists");
    retry.props.onClick();
    const loadingHtml = render();
    await setImmediate();
    return { loadingHtml, html: render() };
  } };
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
  assert.deepEqual(alerts, []);
  assert.match(html, /role="alert"/);
  assert.match(html, /経費一覧を取得できませんでした/);
  assert.doesNotMatch(html, /該当する経費がありません/);
  assert.doesNotMatch(html, /表示件数: 0件/);
  assert.match(html, /disabled=""[^>]*>PDFプレビュー/);
  assert.match(html, /disabled=""[^>]*>経費明細CSV/);
});


test("expense list distinguishes a successful empty response", async () => {
  const { html } = await loadExpenses();
  assert.match(html, /該当する経費がありません/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.match(html, /表示件数: 0件/);
});

test("expense list handles network rejection and recovers after retry", async () => {
  const page = await loadExpenses({ rejectQuery: true });
  assert.match(page.html, /経費一覧を取得できませんでした/);
  assert.doesNotMatch(page.html, /該当する経費がありません/);
  const { loadingHtml, html } = await page.retry();
  assert.match(loadingHtml, /読み込み中/);
  assert.match(loadingHtml, /disabled=""[^>]*>PDFプレビュー/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.match(html, /該当する経費がありません/);
  assert.equal(page.queries.length, 2);
});

async function loadExpenseEdit({ row, error = null, rejectQuery = false } = {}) {
  const compiled = compile("../app/expenses/[id]/page.tsx");
  const hookState = createHooks();
  const queries = [];
  const redirects = [];
  const router = { push: (url) => redirects.push(url) };
  const expense = row ?? {
    id: "expense-1",
    expense_date: "2026-09-27",
    category: "材料費",
    amount: 2400,
    memo: "ジェル購入",
    receipt_url: null,
  };
  const supabase = {
    from(table) {
      assert.equal(table, "expenses");
      const query = { table };
      queries.push(query);
      const chain = {
        select(value) { query.select = value; return chain; },
        eq(key, value) { query.eq = [key, value]; return chain; },
        async single() {
          if (rejectQuery) throw new Error("offline");
          return { data: error ? null : expense, error };
        },
      };
      return chain;
    },
    storage: { from() { throw new Error("storage must not be called while loading"); } },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return hookState.hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/navigation") return {
        useParams: () => ({ id: "expense-1" }),
        useRouter: () => router,
      };
      if (name === "@/lib/supabase") return { supabase };
      if (name === "@/lib/expenseReceiptStorage") {
        return {
          EXPENSE_RECEIPT_BUCKET: "visit-photos",
          getExpenseReceiptStoragePath: () => null,
        };
      }
      if (name === "../ExpenseReceiptImage") {
        return { default: ({ src }) => require("react").createElement("img", { src, alt: "レシート" }) };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
    console,
    alert() {},
    window: { confirm: () => false },
    fetch: () => { throw new Error("delete API must not be called while loading"); },
    Date,
    Math,
  }, { filename: "expense-edit-page.js" });
  const render = () => {
    hookState.reset();
    return renderToStaticMarkup(exports.default());
  };
  render();
  await settleEffects(hookState.effects);
  return {
    get html() { return render(); },
    queries,
    redirects,
    async retry() {
      hookState.reset();
      const tree = exports.default();
      function findRetry(node) {
        if (!node || typeof node !== "object") return null;
        if (node.type === "button" && node.props.children === "再試行") return node;
        for (const child of [node.props?.children].flat(Infinity)) {
          const found = findRetry(child);
          if (found) return found;
        }
        return null;
      }
      error = null;
      rejectQuery = false;
      const retry = findRetry(tree);
      assert.ok(retry, "retry button exists");
      retry.props.onClick();
      const loadingHtml = render();
      await setImmediate();
      return { loadingHtml, html: render() };
    },
  };
}

test("expense edit loads its exact row and renders the editable values", async () => {
  const page = await loadExpenseEdit();
  assert.equal(page.queries.length, 1);
  assert.equal(page.queries[0].select, "id, expense_date, category, amount, memo, receipt_url");
  assert.deepEqual(page.queries[0].eq, ["id", "expense-1"]);
  assert.match(page.html, /value="2026-09-27"/);
  assert.match(page.html, /value="2400"/);
  assert.match(page.html, /ジェル購入/);
  assert.deepEqual(page.redirects, []);
});

test("expense edit keeps a transient read failure visible without redirecting", async () => {
  const page = await loadExpenseEdit({ error: { code: "500", message: "read failed" } });
  assert.match(page.html, /role="alert"/);
  assert.match(page.html, /経費データを取得できませんでした/);
  assert.match(page.html, /再試行/);
  assert.deepEqual(page.redirects, []);
});

test("expense edit distinguishes a missing row from a transient failure", async () => {
  const page = await loadExpenseEdit({ error: { code: "PGRST116", message: "0 rows" } });
  assert.match(page.html, /経費データが見つかりません/);
  assert.doesNotMatch(page.html, /経費データを取得できませんでした/);
  assert.deepEqual(page.redirects, []);
});

test("expense edit recovers from a network rejection after retry", async () => {
  const page = await loadExpenseEdit({ rejectQuery: true });
  assert.match(page.html, /経費データを取得できませんでした/);
  const { loadingHtml, html } = await page.retry();
  assert.match(loadingHtml, /読み込み中/);
  assert.match(html, /value="2400"/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.equal(page.queries.length, 2);
});

async function loadCustomerEdit({ row, error = null, rejectQuery = false } = {}) {
  const compiled = compile("../app/customers/[id]/edit/page.tsx");
  const hookState = createHooks();
  const queries = [];
  const redirects = [];
  const router = { push: (url) => redirects.push(url) };
  const customer = row ?? {
    id: "customer-1",
    name: "山田 花子",
    name_kana: "ヤマダ ハナコ",
    phone: "+819012345678",
  };
  const supabase = {
    from(table) {
      assert.equal(table, "customers");
      const query = { table };
      queries.push(query);
      const chain = {
        select(value) { query.select = value; return chain; },
        eq(key, value) { query.eq = [key, value]; return chain; },
        async single() {
          if (rejectQuery) throw new Error("offline");
          return { data: error ? null : customer, error };
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
      if (name === "next/navigation") return {
        useParams: () => ({ id: "customer-1" }),
        useRouter: () => router,
      };
      if (name === "@/lib/supabase") return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
    console,
    alert() {},
  }, { filename: "customer-edit-page.js" });
  const render = () => {
    hookState.reset();
    return renderToStaticMarkup(exports.default());
  };
  render();
  await settleEffects(hookState.effects);
  return {
    get html() { return render(); },
    queries,
    redirects,
    async retry() {
      hookState.reset();
      const tree = exports.default();
      function findRetry(node) {
        if (!node || typeof node !== "object") return null;
        if (node.type === "button" && node.props.children === "再試行") return node;
        for (const child of [node.props?.children].flat(Infinity)) {
          const found = findRetry(child);
          if (found) return found;
        }
        return null;
      }
      error = null;
      rejectQuery = false;
      const retry = findRetry(tree);
      assert.ok(retry, "retry button exists");
      retry.props.onClick();
      const loadingHtml = render();
      await setImmediate();
      return { loadingHtml, html: render() };
    },
  };
}

test("customer edit loads the selected customer before enabling edits", async () => {
  const page = await loadCustomerEdit();
  assert.equal(page.queries.length, 1);
  assert.equal(page.queries[0].select, "id, name, name_kana, phone");
  assert.deepEqual(page.queries[0].eq, ["id", "customer-1"]);
  assert.match(page.html, /value="山田 花子"/);
  assert.match(page.html, /value="\+819012345678"/);
  assert.deepEqual(page.redirects, []);
});

test("customer edit blocks an empty form after a transient read failure", async () => {
  const page = await loadCustomerEdit({ error: { code: "500", message: "read failed" } });
  assert.match(page.html, /role="alert"/);
  assert.match(page.html, /顧客情報を取得できませんでした/);
  assert.match(page.html, /再試行/);
  assert.doesNotMatch(page.html, /更新する/);
  assert.deepEqual(page.redirects, []);
});

test("customer edit distinguishes a missing customer from a read failure", async () => {
  const page = await loadCustomerEdit({ error: { code: "PGRST116", message: "0 rows" } });
  assert.match(page.html, /顧客情報が見つかりません/);
  assert.doesNotMatch(page.html, /顧客情報を取得できませんでした/);
  assert.doesNotMatch(page.html, /更新する/);
});

test("customer edit recovers from a rejected query after retry", async () => {
  const page = await loadCustomerEdit({ rejectQuery: true });
  assert.match(page.html, /顧客情報を取得できませんでした/);
  const { loadingHtml, html } = await page.retry();
  assert.match(loadingHtml, /読み込み中/);
  assert.match(html, /value="山田 花子"/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.equal(page.queries.length, 2);
});

async function loadFinance({ visits = [], expenses = [], errorTable = null, rejectTable = null } = {}) {
  const compiled = compile("../app/finance/page.tsx");
  const hookState = createHooks();
  const queries = [];
  const supabase = {
    from(table) {
      assert.ok(table === "visits" || table === "expenses");
      const query = { table };
      queries.push(query);
      const chain = {
        select(value) { query.select = value; return chain; },
        then(resolve, reject) {
          if (rejectTable === table) return Promise.reject(new Error("offline")).then(resolve, reject);
          return Promise.resolve({
            data: table === "visits" ? visits : expenses,
            error: errorTable === table ? { message: `${table} failed` } : null,
          }).then(resolve, reject);
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
      if (name === "@/lib/supabase") return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
    console,
    Date,
    Promise,
  }, { filename: "finance-page.js" });
  const render = () => {
    hookState.reset();
    return renderToStaticMarkup(exports.default());
  };
  render();
  await settleEffects(hookState.effects);
  return {
    get html() { return render(); },
    queries,
    async retry() {
      hookState.reset();
      const tree = exports.default();
      function findRetry(node) {
        if (!node || typeof node !== "object") return null;
        if (node.type === "button" && node.props.children === "再試行") return node;
        for (const child of [node.props?.children].flat(Infinity)) {
          const found = findRetry(child);
          if (found) return found;
        }
        return null;
      }
      errorTable = null;
      rejectTable = null;
      const retry = findRetry(tree);
      assert.ok(retry, "retry button exists");
      retry.props.onClick();
      const loadingHtml = render();
      await setImmediate();
      return { loadingHtml, html: render() };
    },
  };
}

test("finance totals the selected month only after both queries succeed", async () => {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const page = await loadFinance({
    visits: [
      { visit_date: `${month}-02`, price: 12000 },
      { visit_date: "2020-01-01", price: 999999 },
    ],
    expenses: [
      { expense_date: `${month}-03`, amount: 2500 },
      { expense_date: "2020-01-01", amount: 999999 },
    ],
  });
  assert.deepEqual(page.queries.map(({ table, select }) => [table, select]), [
    ["visits", "price, visit_date"],
    ["expenses", "amount, expense_date"],
  ]);
  assert.match(page.html, /¥12,000/);
  assert.match(page.html, /¥2,500/);
  assert.match(page.html, /¥9,500/);
  assert.match(page.html, /利益率 79%/);
});

test("finance never presents zero totals when one source returns an error", async () => {
  const page = await loadFinance({ errorTable: "expenses" });
  assert.match(page.html, /role="alert"/);
  assert.match(page.html, /収支データを取得できませんでした/);
  assert.doesNotMatch(page.html, /<p class="text-sm text-gray-500">売上<\/p>/);
  assert.doesNotMatch(page.html, /<p class="text-sm text-gray-500">経費<\/p>/);
});

test("finance handles a rejected query without showing stale KPI cards", async () => {
  const page = await loadFinance({ rejectTable: "visits" });
  assert.match(page.html, /収支データを取得できませんでした/);
  assert.doesNotMatch(page.html, /利益率/);
});

test("finance reloads both sources after a retry", async () => {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const page = await loadFinance({
    visits: [{ visit_date: `${month}-02`, price: 5000 }],
    expenses: [{ expense_date: `${month}-03`, amount: 1000 }],
    rejectTable: "visits",
  });
  const { loadingHtml, html } = await page.retry();
  assert.match(loadingHtml, /集計中/);
  assert.match(html, /¥5,000/);
  assert.match(html, /¥1,000/);
  assert.equal(page.queries.length, 4);
});
