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
  readFileSync(new URL("../app/sales/page.tsx", import.meta.url), "utf8"),
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

function currentVisitDate() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

async function mount({ mode = "success" } = {}) {
  const states = [];
  const effects = [];
  const queries = [];
  let cursor = 0;
  let responseMode = mode;

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) {
        states[index] = typeof initial === "function" ? initial() : initial;
      }

      return [
        states[index],
        (value) => {
          states[index] =
            typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useEffect(fn) {
      effects.push(fn);
    },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Error,
    Math,
    Number,
    Promise,
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              const query = { table };
              queries.push(query);
              const chain = {
                select(columns) {
                  query.columns = columns;
                  return chain;
                },
                in(column, values) {
                  query.in = [column, [...values]];
                  return chain;
                },
                order(column, options) {
                  query.order = [column, options];
                  return chain;
                },
                then(resolve, reject) {
                  return Promise.resolve()
                    .then(() => {
                      const visitQuery = table === "visits";
                      const rejects =
                        responseMode === "visit-rejection" ||
                        responseMode === "payment-rejection";
                      const errors =
                        responseMode === "visit-query-error" ||
                        responseMode === "payment-query-error";

                      if (
                        (visitQuery && responseMode.startsWith("visit-") && rejects) ||
                        (!visitQuery && responseMode.startsWith("payment-") && rejects)
                      ) {
                        throw new Error("offline");
                      }

                      if (
                        (visitQuery && responseMode.startsWith("visit-") && errors) ||
                        (!visitQuery && responseMode.startsWith("payment-") && errors)
                      ) {
                        return { data: null, error: { message: "read failed" } };
                      }

                      if (visitQuery && responseMode === "empty") {
                        return { data: [], error: null };
                      }

                      if (visitQuery) {
                        return {
                          data: [
                            {
                              id: "visit-1",
                              customer_id: "customer-1",
                              visit_date: currentVisitDate(),
                              menu_name: "ケア",
                              staff_name: "担当者",
                              price: 1000,
                              payment_method: "現金",
                              customers: { name: "テスト顧客" },
                            },
                          ],
                          error: null,
                        };
                      }

                      return {
                        data: [
                          {
                            id: "payment-1",
                            visit_id: "visit-1",
                            payment_method: "カード",
                            amount: 1000,
                            sort_order: 1,
                          },
                        ],
                        error: null,
                      };
                    })
                    .then(resolve, reject);
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

  const initialHtml = html();
  for (const effect of effects.splice(0)) effect();
  await setImmediate();

  return {
    html,
    initialHtml,
    queries,
    async retry() {
      const button = findNode(
        tree(),
        (node) => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button);
      responseMode = "success";
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
  };
}

for (const mode of [
  "visit-query-error",
  "visit-rejection",
  "payment-query-error",
  "payment-rejection",
]) {
  test(`sales list hides incomplete data after ${mode} and retries`, async () => {
    const page = await mount({ mode });

    assert.match(page.initialHtml, /読み込み中/);
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /集計値は表示していません/);
    assert.doesNotMatch(
      page.html(),
      /対象月売上|施術件数|支払い方法別売上|テスト顧客|>編集</
    );

    await page.retry();

    assert.doesNotMatch(page.html(), /role="alert"|読み込み中/);
    assert.match(page.html(), /対象月売上/);
    assert.match(page.html(), /施術件数/);
    assert.match(page.html(), /支払い方法別売上/);
    assert.match(page.html(), /テスト顧客/);
    assert.match(page.html(), /カード ¥1,000/);
  });
}

test("sales list preserves an authoritative empty result", async () => {
  const page = await mount({ mode: "empty" });

  assert.doesNotMatch(page.html(), /role="alert"|読み込み中/);
  assert.match(page.html(), /対象月売上/);
  assert.match(page.html(), /¥0/);
  assert.match(page.html(), /0件/);
  assert.match(page.html(), /対象月の売上データはありません/);
  assert.equal(page.queries.length, 1);
});

test("sales list loads visits and payment details together", async () => {
  const page = await mount();

  assert.doesNotMatch(page.html(), /role="alert"|読み込み中/);
  assert.match(page.html(), /テスト顧客/);
  assert.match(page.html(), /カード ¥1,000/);
  assert.equal(page.queries.length, 2);
  assert.equal(page.queries[0].table, "visits");
  assert.equal(page.queries[1].table, "visit_payments");
});
