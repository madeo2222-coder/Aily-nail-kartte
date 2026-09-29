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
  readFileSync(
    new URL(
      "../app/sales-dashboard/SalesDashboardPageClient.tsx",
      import.meta.url
    ),
    "utf8"
  ),
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

function currentDateParts() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return { today: `${year}-${month}-${day}`, month: `${year}-${month}` };
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
                order(column, options) {
                  query.order = [column, options];
                  return chain;
                },
                then(resolve, reject) {
                  return Promise.resolve()
                    .then(() => {
                      if (responseMode === "rejection") {
                        throw new Error("offline");
                      }
                      if (responseMode === "query-error") {
                        return {
                          data: null,
                          error: { message: "read failed" },
                        };
                      }
                      if (responseMode === "empty") {
                        return { data: [], error: null };
                      }

                      const { today, month } = currentDateParts();
                      return {
                        data: [
                          {
                            id: "visit-1",
                            customer_id: "customer-1",
                            visit_date: today,
                            menu_name: "ケア",
                            price: 1000,
                            created_at: `${today}T00:00:00Z`,
                          },
                          {
                            id: "visit-2",
                            customer_id: "customer-2",
                            visit_date: `${month}-01`,
                            menu_name: "カラー",
                            price: 3000,
                            created_at: `${month}-01T00:00:00Z`,
                          },
                          {
                            id: "visit-3",
                            customer_id: "customer-3",
                            visit_date: "2020-01-01",
                            menu_name: "アート",
                            price: 5000,
                            created_at: "2020-01-01T00:00:00Z",
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
      assert.doesNotMatch(html(), />今日の売上<|>今月の売上<|>平均単価</);
      await setImmediate();
    },
  };
}

for (const mode of ["query-error", "rejection"]) {
  test(`sales dashboard hides KPI after ${mode} and recovers`, async () => {
    const page = await mount({ mode });

    assert.match(page.initialHtml, /読み込み中/);
    assert.doesNotMatch(
      page.initialHtml,
      />今日の売上<|>今月の売上<|>平均単価</
    );
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /集計値は表示していません/);
    assert.doesNotMatch(
      page.html(),
      />今日の売上<|>今月の売上<|>平均単価</
    );

    await page.retry();

    assert.doesNotMatch(page.html(), /role="alert"|読み込み中/);
    assert.match(page.html(), /今日の売上/);
    assert.match(page.html(), /¥1,000/);
    assert.match(page.html(), /今月の売上/);
    assert.match(page.html(), /¥4,000/);
    assert.match(page.html(), /3件/);
    assert.match(page.html(), /¥3,000/);
    assert.equal(page.queries.length, 2);
  });
}

test("sales dashboard preserves authoritative zero KPI", async () => {
  const page = await mount({ mode: "empty" });

  assert.doesNotMatch(page.html(), /role="alert"|読み込み中/);
  assert.match(page.html(), /今日の売上/);
  assert.match(page.html(), /今月の売上/);
  assert.match(page.html(), /¥0/);
  assert.match(page.html(), /0件/);
  assert.equal(page.queries.length, 1);
});

test("sales dashboard uses its canonical visit query", async () => {
  const page = await mount();

  assert.deepEqual(JSON.parse(JSON.stringify(page.queries)), [
    {
      table: "visits",
      columns:
        "id, customer_id, visit_date, menu_name, price, created_at",
      order: ["visit_date", { ascending: false }],
    },
  ]);
  assert.doesNotMatch(page.html(), /role="alert"|読み込み中/);
});
