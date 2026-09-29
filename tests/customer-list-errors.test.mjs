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
  readFileSync(new URL("../app/customers/CustomersPageClient.tsx", import.meta.url), "utf8"),
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
  const queries = [];
  let cursor = 0;
  let effect;
  let shouldFail = Boolean(failureTable);

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

  function response(table) {
    if (shouldFail && table === failureTable) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }
    if (empty) return { data: [], error: null };
    if (table === "customers") {
      return {
        data: [{ id: "customer-1", name: "顧客A", name_kana: "コキャクエー", allergy: "金属" }],
        error: null,
      };
    }
    return {
      data: [{
        customer_id: "customer-1",
        next_visit_date: "2026-10-10",
        next_proposal: "秋ネイル",
        visit_date: "2026-09-20",
      }],
      error: null,
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Map,
    Set,
    Promise,
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          const query = { table };
          queries.push(query);
          const chain = {
            select(columns) { query.columns = columns; return chain; },
            order(column, options) { query.order = [column, options]; return chain; },
            then(resolve, reject) {
              return Promise.resolve().then(() => response(table)).then(resolve, reject);
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

for (const failureTable of ["customers", "visits"]) {
  for (const rejection of [false, true]) {
    test(`customer list blocks incomplete data after ${failureTable} ${rejection ? "rejection" : "query error"}`, async () => {
      const page = await mount({ failureTable, rejection });
      assert.match(page.html(), /role="alert"/);
      assert.match(page.html(), /顧客一覧を取得できませんでした/);
      assert.doesNotMatch(page.html(), /表示件数|条件に合うお客様はいません|顧客A|秋ネイル|顧客を追加|顧客統合/);
      await page.retry();
      assert.doesNotMatch(page.html(), /role="alert"|条件に合うお客様はいません/);
      assert.match(page.html(), /表示件数 1件/);
      assert.match(page.html(), /顧客A/);
      assert.match(page.html(), /秋ネイル/);
      assert.match(page.html(), /顧客を追加/);
      assert.match(page.html(), /顧客統合/);
    });
  }
}

test("customer list preserves an authoritative empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /表示件数 0件/);
  assert.match(page.html(), /条件に合うお客様はいません/);
  assert.match(page.html(), /顧客を追加/);
  assert.equal(page.queries.length, 2);
});

test("customer list renders complete customer and visit data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|条件に合うお客様はいません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /金属/);
  assert.match(page.html(), /2026\/10\/10/);
  assert.match(page.html(), /秋ネイル/);
  assert.equal(page.queries.length, 2);
});
