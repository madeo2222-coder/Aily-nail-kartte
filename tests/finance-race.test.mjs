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
  readFileSync(new URL("../app/finance/page.tsx", import.meta.url), "utf8"),
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

async function mount() {
  const states = [];
  const requests = [];
  let cursor = 0;
  let effect;
  let cleanup;
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
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          return { select() {
            return new Promise((resolve, reject) => requests.push({ table, resolve, reject }));
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
    requests,
    html,
    changeMonth(month) {
      findNode(tree(), node => node.props?.type === "month").props.onChange({ target: { value: month } });
    },
    runMonthEffect() {
      cleanup?.();
      tree();
      cleanup = effect();
    },
    unmount() { cleanup?.(); },
  };
}

function completePair(requests, start, sales, expenses) {
  requests[start].resolve({
    error: null,
    data: [{ visit_date: "2026-10-02", price: sales }],
  });
  requests[start + 1].resolve({
    error: null,
    data: [{ expense_date: "2026-10-03", amount: expenses }],
  });
}

for (const outcome of ["success", "error", "rejection"]) {
  test(`late finance ${outcome} cannot overwrite the newly selected month`, async () => {
    const page = await mount();
    assert.equal(page.requests.length, 2);
    page.changeMonth("2026-10");
    assert.match(page.html(), /集計中/);
    page.runMonthEffect();
    await setImmediate();
    assert.equal(page.requests.length, 4);
    completePair(page.requests, 2, 12000, 2500);
    await setImmediate();
    const currentHtml = page.html();
    assert.match(currentHtml, /¥12,000/);
    assert.match(currentHtml, /¥2,500/);
    if (outcome === "success") completePair(page.requests, 0, 99999, 99999);
    if (outcome === "error") {
      page.requests[0].resolve({ data: null, error: { message: "stale" } });
      page.requests[1].resolve({ data: [], error: null });
    }
    if (outcome === "rejection") {
      page.requests[0].reject(new Error("stale"));
      page.requests[1].resolve({ data: [], error: null });
    }
    await setImmediate();
    assert.equal(page.html(), currentHtml);
  });
}

test("an obsolete rejection cannot stop the next month's loading state", async () => {
  const page = await mount();
  page.changeMonth("2026-10");
  page.requests[0].reject(new Error("old"));
  page.requests[1].resolve({ data: [], error: null });
  await setImmediate();
  assert.match(page.html(), /集計中/);
  assert.doesNotMatch(page.html(), /role="alert"/);
});

test("unmount invalidates pending finance requests", async () => {
  const page = await mount();
  const before = page.html();
  page.unmount();
  completePair(page.requests, 0, 1000, 100);
  await setImmediate();
  assert.equal(page.html(), before);
});
