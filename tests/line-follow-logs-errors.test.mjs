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
  readFileSync(new URL("../app/line-follow-logs/page.tsx", import.meta.url), "utf8"),
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
        id: "log-1",
        created_at: "2026-09-29T00:00:00Z",
        log_type: "copy",
        message_pattern: "来店後フォロー",
        signature_type: "店舗名",
        message_body: "ご来店ありがとうございました",
        customers: { name: "顧客A" },
      }],
      error: null,
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Promise,
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              assert.equal(table, "line_follow_logs");
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
  assert.doesNotMatch(html(), /送信履歴はありません/);
  tree();
  effect();
  await setImmediate();

  return {
    queries,
    html,
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

test("line follow logs hide the empty state after a query error", async () => {
  const page = await mount({ failure: true });
  assert.match(page.html(), /role="alert"/);
  assert.match(page.html(), /LINE送信履歴を取得できませんでした/);
  assert.doesNotMatch(page.html(), /送信履歴はありません|顧客A/);
});

test("line follow logs handle a rejected query", async () => {
  const page = await mount({ failure: true, rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /送信履歴はありません|顧客A/);
});

test("line follow logs recover after retry", async () => {
  const page = await mount({ failure: true });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"|送信履歴はありません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /ご来店ありがとうございました/);
  assert.equal(page.queries.length, 2);
});

test("line follow logs preserve a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /送信履歴はありません/);
});

test("line follow logs render a complete successful record", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|送信履歴はありません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /種類：コピー/);
  assert.match(page.html(), /来店後フォロー/);
  assert.match(page.html(), /ご来店ありがとうございました/);
  assert.equal(page.queries[0].orders.length, 1);
  assert.equal(page.queries[0].orders[0][0], "created_at");
  assert.equal(page.queries[0].orders[0][1].ascending, false);
});
