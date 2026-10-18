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
  readFileSync(new URL("../app/monthly-closing/page.tsx", import.meta.url), "utf8"),
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

async function mount({ failureTable = "", rejection = false, empty = false, missingExpenses = false } = {}) {
  const states = [];
  let cursor = 0;
  let effect;
  let cleanup;
  let shouldFail = Boolean(failureTable || missingExpenses);
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
          queries.push(table);
          return { async select() {
            if (shouldFail && rejection && table === failureTable) throw new Error("offline");
            if (shouldFail && missingExpenses && table === "expenses") {
              return { data: null, error: { message: "Could not find the table 'public.expenses'" } };
            }
            if (shouldFail && table === failureTable) {
              return { data: null, error: { message: "read failed" } };
            }
            if (empty) return { data: [], error: null };
            return { error: null, data: table === "visits"
              ? [{ visit_date: "2026-09-20", price: 12000 }]
              : [{ expense_date: "2026-09-20", amount: 2500 }] };
          } };
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
      assert.match(html(), /\.\.\./);
      await setImmediate();
    },
  };
}

for (const failureTable of ["visits", "expenses"]) {
  for (const rejection of [false, true]) {
    test(`monthly closing stops incomplete totals after ${failureTable} ${rejection ? "rejection" : "error"}`, async () => {
      const page = await mount({ failureTable, rejection });
      assert.match(page.html(), /role="alert"/);
      assert.doesNotMatch(page.html(), /総売上|総経費|総利益|集計できるデータがまだありません/);
      await page.retry();
      assert.doesNotMatch(page.html(), /role="alert"/);
      assert.match(page.html(), /¥12,000/);
      assert.match(page.html(), /¥2,500/);
      assert.match(page.html(), /¥9,500/);
    });
  }
}

test("monthly closing does not treat a missing expenses table as zero expenses", async () => {
  const page = await mount({ missingExpenses: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /総売上|総経費|総利益|経費は ¥0/);
});

test("monthly closing keeps legitimate zero totals after a successful empty response", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /総売上/);
  assert.match(page.html(), /集計できるデータがまだありません/);
});
