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
  readFileSync(new URL("../app/reviews/page.tsx", import.meta.url), "utf8"),
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

async function mount({ failure = false, rejection = false, empty = false } = {}) {
  const states = [];
  let cursor = 0;
  let effect;
  let shouldFail = failure;
  const pushes = [];
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

  function response() {
    if (shouldFail) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }
    if (empty) return { data: [], error: null };
    return {
      data: [{
        id: "customer-1",
        name: "顧客A",
        phone: "090-0000-0000",
        line: "line-a",
        memo: "口コミ案内済み",
        created_at: "2026-09-29T00:00:00Z",
      }],
      error: null,
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Number,
    Promise,
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/navigation") {
        return { useRouter: () => ({ push: value => pushes.push(value) }) };
      }
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              assert.equal(table, "customers");
              const query = { select: "", orders: [] };
              queries.push(query);
              const chain = {
                select(value) { query.select = value; return chain; },
                order(column, options) {
                  query.orders.push([column, options]);
                  return Promise.resolve().then(response);
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
    pushes,
    queries,
    tree,
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button, "retry button exists");
      shouldFail = false;
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
  };
}

test("reviews hide false zero and customer actions after a query error", async () => {
  const page = await mount({ failure: true });
  assert.match(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客情報を取得できませんでした/);
  assert.doesNotMatch(
    page.html(),
    /対象顧客数|0名|該当する顧客がいません|>顧客詳細<|>口コミ依頼ページ</
  );
});

test("reviews handle a rejected customer query", async () => {
  const page = await mount({ failure: true, rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /対象顧客数|該当する顧客がいません/);
});

test("reviews recover after retry", async () => {
  const page = await mount({ failure: true });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"|該当する顧客がいません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /口コミ案内済み/);
  assert.match(page.html(), /対象顧客数/);
  assert.equal(page.queries.length, 2);
});

test("reviews preserve a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /対象顧客数/);
  assert.match(page.html(), /0名/);
  assert.match(page.html(), /該当する顧客がいません/);
});

test("reviews render complete customer data and navigation actions", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|該当する顧客がいません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /090-0000-0000/);
  assert.match(page.html(), /line-a/);

  const reviewButton = findNode(
    page.tree(),
    node => node.type === "button" && node.props.children === "口コミ依頼ページ"
  );
  assert.ok(reviewButton);
  reviewButton.props.onClick();
  assert.deepEqual(page.pushes, ["/customers/customer-1/mypage"]);
  assert.equal(page.queries[0].select, "id, name, phone, line, memo, created_at");
  assert.equal(page.queries[0].orders[0][0], "created_at");
  assert.equal(page.queries[0].orders[0][1].ascending, false);
});
