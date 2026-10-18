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
  readFileSync(new URL("../app/visits/VisitsPageClient.tsx", import.meta.url), "utf8"),
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

async function mount({ failingTable = "", rejection = false, empty = false } = {}) {
  const states = [];
  let cursor = 0;
  let effect;
  let activeFailure = failingTable;
  const queries = [];

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) {
        states[index] = typeof initial === "function" ? initial() : initial;
      }
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

  const visits = [{
    id: "visit-1",
    customer_id: "customer-1",
    visit_date: "2026-09-15",
    price: 12000,
    payment_method: "現金",
    memo: "次回は秋色",
    next_visit_date: "2026-10-15",
    next_proposal: "マグネット",
    next_suggestion: null,
    customers: { name: "顧客A" },
  }];
  const payments = [{
    id: "payment-1",
    visit_id: "visit-1",
    payment_method: "カード",
    amount: 12000,
    sort_order: 1,
  }];

  function response(table) {
    if (activeFailure === table) {
      if (rejection) throw new Error(`${table} offline`);
      return { data: null, error: { message: `${table} failed` } };
    }
    return {
      data: table === "visits" ? (empty ? [] : visits) : payments,
      error: null,
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Blob,
    Date,
    Error,
    Number,
    Promise,
    String,
    Uint8Array,
    URL: {
      createObjectURL: () => "blob:test",
      revokeObjectURL() {},
    },
    alert() {},
    console: { error() {} },
    document: {
      createElement: () => ({ click() {} }),
    },
    window: { print() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              assert.ok(table === "visits" || table === "visit_payments");
              const query = { table, selected: "", ids: [] };
              queries.push(query);
              const chain = {
                select(value) { query.selected = value; return chain; },
                in(column, values) {
                  assert.equal(column, "visit_id");
                  query.ids = values;
                  return chain;
                },
                order() {
                  return Promise.resolve().then(() => response(table));
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

  function tree() {
    cursor = 0;
    return exports.default();
  }

  function html() {
    return renderToStaticMarkup(tree());
  }

  assert.match(html(), /読み込み中/);
  tree();
  effect();
  await setImmediate();

  return {
    html,
    queries,
    tree,
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button, "retry button exists");
      activeFailure = "";
      const promise = button.props.onClick();
      assert.match(html(), /読み込み中/);
      await promise;
    },
  };
}

for (const rejection of [false, true]) {
  test(`visits report blocks output after visits ${rejection ? "rejection" : "query error"}`, async () => {
    const page = await mount({ failingTable: "visits", rejection });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /施術実績を取得できませんでした/);
    assert.doesNotMatch(
      page.html(),
      /施術件数|売上合計|来店履歴がありません|売上明細CSV|PDFプレビュー|来店履歴を追加/
    );
    assert.equal(page.queries.filter(query => query.table === "visit_payments").length, 0);
  });
}

for (const rejection of [false, true]) {
  test(`visits report blocks partial data after payments ${rejection ? "rejection" : "query error"}`, async () => {
    const page = await mount({ failingTable: "visit_payments", rejection });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(page.html(), /顧客A|12,000|売上明細CSV|PDFプレビュー/);
  });
}

test("visits report retries both authoritative sources", async () => {
  const page = await mount({ failingTable: "visit_payments" });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"|来店履歴がありません/);
  assert.match(page.html(), /顧客A|12,000|売上明細CSV|PDFプレビュー/);
  assert.equal(page.queries.filter(query => query.table === "visits").length, 2);
  assert.equal(page.queries.filter(query => query.table === "visit_payments").length, 2);
});

test("visits report preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /施術件数|売上合計|来店履歴がありません/);
  assert.equal(page.queries.filter(query => query.table === "visit_payments").length, 0);
});

test("visits report renders complete visit and payment data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|来店履歴がありません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /カード/);
  assert.match(page.html(), /12,000/);
  assert.deepEqual(page.queries.at(-1).ids, ["visit-1"]);
});
