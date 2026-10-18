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

async function mount({ rejection = false, failure = false, empty = false } = {}) {
  const states = [];
  const requests = [];
  let cursor = 0;
  let effect;
  let activeFailure = failure;

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
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (activeFailure && rejection) throw new Error("offline");
      if (activeFailure) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: "read failed" }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          visits: empty ? [] : visits,
          payments: empty ? [] : payments,
        }),
      };
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
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
    requests,
    tree,
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button, "retry button exists");
      activeFailure = false;
      const promise = button.props.onClick();
      assert.match(html(), /読み込み中/);
      await promise;
    },
  };
}

for (const rejection of [false, true]) {
  test(`visits report blocks incomplete API data after ${rejection ? "rejection" : "error response"}`, async () => {
    const page = await mount({ failure: true, rejection });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /施術実績を取得できませんでした/);
    assert.doesNotMatch(
      page.html(),
      /施術件数|売上合計|来店履歴がありません|売上明細CSV|PDFプレビュー|来店履歴を追加/
    );
    assert.equal(page.requests.length, 1);
  });
}

test("visits report retries the authenticated API", async () => {
  const page = await mount({ failure: true });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"|来店履歴がありません/);
  assert.match(page.html(), /顧客A|12,000|売上明細CSV|PDFプレビュー/);
  assert.equal(page.requests.length, 2);
});

test("visits report preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /施術件数|売上合計|来店履歴がありません/);
  assert.equal(page.requests.length, 1);
});

test("visits report renders complete visit and payment data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|来店履歴がありません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /カード/);
  assert.match(page.html(), /12,000/);
  assert.deepEqual(JSON.parse(JSON.stringify(page.requests)), [{
    url: "/api/visits/list-data",
    options: { cache: "no-store" },
  }]);
});
