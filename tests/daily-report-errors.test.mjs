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
  readFileSync(new URL("../app/reports/daily/page.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
).outputText;

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ["2026-09-20T12:00:00Z"]));
  }
}

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function mount({ failure = "error", empty = false } = {}) {
  const states = [];
  let cursor = 0;
  let effect;
  let cleanup;
  let shouldFail = failure !== "";
  const queries = [];
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
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useEffect: fn => { effect = fn; },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    console: { error() {} },
    Date: FixedDate,
    Promise,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          assert.equal(table, "visits");
          const query = { select: "", orders: [] };
          queries.push(query);
          const chain = {
            select(value) { query.select = value; return chain; },
            async order(column, options) {
              query.orders.push([column, options]);
              if (shouldFail && failure === "rejection") throw new Error("offline");
              if (shouldFail) return { data: null, error: { message: "read failed" } };
              return { error: null, data: empty ? [] : [
                { id: "v1", visit_date: "2026-09-20", price: 8000 },
              ] };
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
  cleanup = effect();
  await setImmediate();
  return {
    queries,
    html,
    unmount() { cleanup?.(); },
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

for (const failure of ["error", "rejection"]) {
  test(`daily report hides false zero KPI after query ${failure} and recovers`, async () => {
    const page = await mount({ failure });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(page.html(), /今日の売上|今月売上|今月来店件数|今月のデータはまだありません/);
    await page.retry();
    assert.doesNotMatch(page.html(), /role="alert"/);
    assert.match(page.html(), /今日の売上/);
    assert.match(page.html(), /¥8,000/);
    assert.equal(page.queries.length, 2);
  });
}

test("daily report keeps legitimate zero KPI for a successful empty response", async () => {
  const page = await mount({ failure: "", empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /今日の売上/);
  assert.match(page.html(), /今月のデータはまだありません/);
});
