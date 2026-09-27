import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ["2026-09-20T12:00:00Z"]));
  }
}
const compiled = ts.transpileModule(
  readFileSync(new URL("../app/reports/monthly/page.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
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

async function mount({ failure = "", rejected = false, empty = false, deferred = false } = {}) {
  const states = [];
  let cursor = 0;
  let effect;
  let cleanup;
  let shouldFail = true;
  const queries = [];
  const requests = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useMemo: fn => fn(),
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
    exports, console: { error() {} }, Date: FixedDate, Intl,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") return { supabase: {
        from(table) {
          queries.push(table);
          const chain = {
            select: () => chain, gte: () => chain, lt: () => chain, in: () => chain,
            async order() {
              if (deferred) return new Promise((resolve, reject) => {
                requests.push({ table, resolve, reject });
              });
              if (shouldFail && table === failure) {
                if (rejected) throw new Error("offline");
                return { data: null, error: { message: "read failed" } };
              }
              return { error: null, data: empty ? [] : table === "visits"
                ? [{ id: "v1", visit_date: "2026-09-20", price: 5000, customer_id: "c1", staff_name: "担当", menu_name: "メニュー" }]
                : [{ id: "p1", visit_id: "v1", amount: 5000, payment_method: "現金", sort_order: 1 }] };
            },
          };
          return chain;
        },
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function render() { cursor = 0; return exports.default(); }
  const initialHtml = renderToStaticMarkup(render());
  cleanup = effect();
  await setImmediate();
  return {
    initialHtml, queries, requests,
    html: () => renderToStaticMarkup(render()),
    changeMonth(month) {
      findNode(render(), node => node.props?.id === "targetMonth").props.onChange({ target: { value: month } });
    },
    runMonthEffect() {
      cleanup?.();
      render();
      cleanup = effect();
    },
    unmount() { cleanup?.(); },
    async retry() {
      const button = findNode(render(), node => node.type === "button" && node.props.children === "再試行");
      assert.ok(button, "retry must be available");
      shouldFail = false;
      button.props.onClick();
      assert.match(renderToStaticMarkup(render()), /月次レポートを読み込み中/);
      await setImmediate();
    },
  };
}

for (const failure of ["visits", "visit_payments"]) {
  for (const rejected of [false, true]) {
    test(`monthly report hides incomplete totals on ${failure} ${rejected ? "rejection" : "error"} and recovers`, async () => {
      const page = await mount({ failure, rejected });
      assert.match(page.initialHtml, /月次レポートを読み込み中/);
      assert.match(page.html(), /role="alert"/);
      assert.doesNotMatch(page.html(), />客単価<|この月の売上データはありません|月次レポートを読み込み中/);
      await page.retry();
      assert.doesNotMatch(page.html(), /role="alert"/);
      assert.match(page.html(), />客単価</);
      assert.match(page.html(), /5,000/);
    });
  }
}

test("monthly report preserves successful empty result without querying payments", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /この月の売上データはありません/);
  assert.deepEqual(page.queries, ["visits"]);
});

function complete(request, amount) {
  request.resolve({ error: null, data: request.table === "visits"
    ? [{ id: `v${amount}`, visit_date: "2026-10-20", price: amount, customer_id: "c1" }]
    : [{ id: `p${amount}`, visit_id: `v${amount}`, amount, payment_method: "現金" }] });
}

for (const stage of ["visits", "visit_payments"]) {
  for (const outcome of ["success", "error", "rejection"]) {
    test(`late ${stage} ${outcome} cannot overwrite a newer month's report`, async () => {
      const page = await mount({ deferred: true });
      if (stage === "visit_payments") {
        complete(page.requests[0], 1111);
        await setImmediate();
      }
      const oldRequest = page.requests.at(-1);
      page.changeMonth("2026-10");
      page.runMonthEffect();
      await setImmediate();
      complete(page.requests.at(-1), 8888);
      await setImmediate();
      complete(page.requests.at(-1), 8888);
      await setImmediate();
      const currentHtml = page.html();
      assert.match(currentHtml, /8,888/);
      if (outcome === "success") complete(oldRequest, 1111);
      if (outcome === "error") oldRequest.resolve({ data: null, error: { message: "stale error" } });
      if (outcome === "rejection") oldRequest.reject(new Error("stale rejection"));
      await setImmediate();
      assert.equal(page.html(), currentHtml);
    });
  }
}

test("switching months hides previous totals before the new Effect starts", async () => {
  const page = await mount();
  assert.match(page.html(), /5,000/);
  page.changeMonth("2026-10");
  assert.match(page.html(), /月次レポートを読み込み中/);
  assert.doesNotMatch(page.html(), />客単価</);
});

test("stale rejection cannot finish loading while the next month is pending", async () => {
  const page = await mount({ deferred: true });
  page.changeMonth("2026-10");
  page.requests[0].reject(new Error("old request failed before Effect cleanup"));
  await setImmediate();
  assert.match(page.html(), /月次レポートを読み込み中/);
  assert.doesNotMatch(page.html(), /role="alert"|>客単価</);
  page.runMonthEffect();
  await setImmediate();
  assert.equal(page.requests.length, 2);
  complete(page.requests[1], 8888);
  await setImmediate();
  complete(page.requests[2], 8888);
  await setImmediate();
  assert.match(page.html(), /8,888/);
});

test("unmount invalidates pending requests without starting payment lookup", async () => {
  const page = await mount({ deferred: true });
  const before = page.html();
  page.unmount();
  complete(page.requests[0], 1111);
  await setImmediate();
  assert.equal(page.html(), before);
  assert.equal(page.requests.length, 1);
});
