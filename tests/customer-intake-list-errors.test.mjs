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
    new URL("../app/customer-intake/list/page.tsx", import.meta.url),
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

async function mount({ failureTable = "", rejection = false, empty = false } = {}) {
  const states = [];
  let cursor = 0;
  let effect;
  let currentFailureTable = failureTable;
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

  function response(table) {
    if (currentFailureTable === table) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }
    if (empty) return { data: [], error: null };
    if (table === "customers") {
      return {
        data: [{ id: "customer-1", name: "顧客A", phone: "090-0000-0000" }],
        error: null,
      };
    }
    return {
      data: [{
        id: "intake-1",
        customer_id: null,
        name: "顧客A",
        phone: "090-0000-0000",
        allergy: "なし",
        ng_items: "なし",
        agreed: true,
        signature_data_url: null,
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
    window: { confirm: () => true },
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/image") return { __esModule: true, default: "img" };
      if (name === "next/link") return { __esModule: true, default: "a" };
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              const query = { table, select: "", orders: [] };
              queries.push(query);
              const chain = {
                select(value) { query.select = value; return chain; },
                order(column, options) {
                  query.orders.push([column, options]);
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
      currentFailureTable = "";
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
  };
}

for (const table of ["customers", "customer_intakes"]) {
  test(`customer intake list hides incomplete data when ${table} fails`, async () => {
    const page = await mount({ failureTable: table });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /初回入力一覧を取得できませんでした/);
    assert.doesNotMatch(
      page.html(),
      /総件数|紐付け済み|未連携|該当する初回入力データはありません|紐付け保存/
    );
  });
}

test("customer intake list handles a rejected query", async () => {
  const page = await mount({ failureTable: "customer_intakes", rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /総件数|該当する初回入力データはありません/);
});

test("customer intake list recovers after retry", async () => {
  const page = await mount({ failureTable: "customers" });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"|該当する初回入力データはありません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /候補あり/);
  assert.match(page.html(), /紐付け保存/);
  assert.equal(page.queries.length, 4);
});

test("customer intake list preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /総件数/);
  assert.match(page.html(), /該当する初回入力データはありません/);
});

test("customer intake list renders complete query results", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|該当する初回入力データはありません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /090-0000-0000/);
  assert.match(page.html(), /紐付け保存/);
  assert.equal(page.queries[0].table, "customers");
  assert.equal(page.queries[0].select, "id,name,phone");
  assert.equal(page.queries[1].table, "customer_intakes");
  assert.match(page.queries[1].select, /customer_id/);
});
