import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/dashboard/DailySalesSummary.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const rows = (date, prices) => prices.map((price, index) => ({ id: `${date}-${index}`, visit_date: date, price }));
const ok = (date, prices) => ({ data: rows(date, prices), count: prices.length, error: null });

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function mount({ now = "2026-10-17T08:00:00Z", respond = (date) => ok(date, date === "2026-10-17" ? [6000, 4000] : [2500]) } = {}) {
  const states = [];
  const effectStates = [];
  const pendingEffects = [];
  const queries = [];
  let cursor = 0;
  let dirty = false;
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
  }
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
        dirty = true;
      }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = effectStates[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          effectStates[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Date: FixedDate, Intl, Number, Set,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/supabase") return { supabase: {
        from(table) { return { select(columns, options) { return {
          eq(field, date) {
            queries.push({ table, columns, options, field, date });
            return Promise.resolve().then(() => respond(date));
          },
        }; } }; },
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function tree() { cursor = 0; dirty = false; return exports.default(); }
  let currentTree = tree();
  async function flush() {
    for (let i = 0; i < 4; i++) {
      while (pendingEffects.length) pendingEffects.shift()();
      await setImmediate();
      if (dirty) currentTree = tree();
    }
  }
  await flush();
  return {
    exports, queries, flush,
    html: () => renderToStaticMarkup(currentTree),
    input: () => findNode(currentTree, (node) => node.type === "input"),
    async select(date) {
      this.input().props.onChange({ target: { value: date } });
      currentTree = tree();
      await flush();
    },
    async inputDate(date) {
      this.input().props.onInput({ currentTarget: { value: date } });
      currentTree = tree();
      await flush();
    },
    async click(label) {
      const button = findNode(currentTree, (node) => node.type === "button" && (node.props.children === label || node.props["aria-label"] === label));
      assert.ok(button, `button ${label} exists`);
      assert.ok(!button.props.disabled, `button ${label} is enabled`);
      button.props.onClick();
      currentTree = tree();
      await flush();
    },
    button: (label) => findNode(currentTree, (node) => node.type === "button" && node.props["aria-label"] === label),
  };
}

test("staff home starts on Japan's current date and reads only that date", async () => {
  const page = await mount({ now: "2026-10-16T15:01:00Z" });
  assert.equal(page.input().props.value, "2026-10-17");
  assert.match(page.html(), /今日の売上/);
  assert.match(page.html(), /¥10,000/);
  assert.match(page.html(), /来店数 2件/);
  assert.deepEqual(JSON.parse(JSON.stringify(page.queries)), [{ table: "visits", columns: "id, visit_date, price", options: { count: "exact" }, field: "visit_date", date: "2026-10-17" }]);
  assert.ok(page.button("翌日の売上を見る").props.disabled);
});

test("calendar, yesterday, previous, next, and today switch the daily total", async () => {
  const page = await mount();
  await page.click("昨日");
  assert.equal(page.input().props.value, "2026-10-16");
  assert.match(page.html(), /2026年10月16日/);
  assert.match(page.html(), /¥2,500/);
  assert.doesNotMatch(page.html(), /¥10,000/);
  await page.select("2026-09-01");
  await page.click("前日の売上を見る");
  assert.equal(page.input().props.value, "2026-08-31");
  await page.click("翌日の売上を見る");
  assert.equal(page.input().props.value, "2026-09-01");
  await page.click("今日");
  assert.match(page.html(), /¥10,000/);
});

test("zero sales is shown only after a complete empty response", async () => {
  const page = await mount({ respond: (date) => ok(date, []) });
  assert.match(page.html(), /¥0/);
  assert.match(page.html(), /来店数 0件/);
  assert.match(page.html(), /この日の来店記録はありません/);
});

test("native date input updates the total and a duplicate change does not reload", async () => {
  const page = await mount();
  await page.inputDate("2026-10-16");
  assert.equal(page.input().props.value, "2026-10-16");
  assert.match(page.html(), /2026年10月16日/);
  assert.match(page.html(), /¥2,500/);
  const count = page.queries.length;
  await page.select("2026-10-16");
  assert.equal(page.queries.length, count);
});

test("failure hides old values and retry recovers the same date", async () => {
  let fail = true;
  const page = await mount({ respond: (date) => date === "2026-10-16" && fail ? Promise.reject(new Error("offline")) : ok(date, [7500]) });
  await page.click("昨日");
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /¥0|¥7,500|来店数 1件/);
  fail = false;
  await page.click("再試行");
  assert.match(page.html(), /¥7,500/);
  assert.equal(page.input().props.value, "2026-10-16");
});

test("rapid date changes cannot expose a late response from the previous date", async () => {
  let finishPrevious;
  const page = await mount({ respond: (date) => date === "2026-10-16" ? new Promise((resolve) => { finishPrevious = resolve; }) : ok(date, [9999]) });
  await page.click("昨日");
  assert.match(page.html(), /売上を読み込み中/);
  assert.doesNotMatch(page.html(), /¥9,999/);
  await page.select("2026-10-15");
  finishPrevious(ok("2026-10-16", [1234]));
  await page.flush();
  assert.match(page.html(), /2026年10月15日/);
  assert.match(page.html(), /¥9,999/);
  assert.doesNotMatch(page.html(), /¥1,234/);
});

test("empty, invalid, and future dates never trigger a query or retain totals", async () => {
  const page = await mount();
  const count = page.queries.length;
  for (const date of ["", "2026-02-30", "not-a-date", "2026-10-18"]) {
    await page.select(date);
    assert.match(page.html(), /今日以前の日付を選択/);
    assert.doesNotMatch(page.html(), /¥10,000|¥0/);
  }
  assert.equal(page.queries.length, count);
});

test("date navigation handles year boundaries and leap days without local time zone drift", async () => {
  const { exports } = await mount();
  assert.equal(exports.shiftSalesDate("2026-01-01", -1), "2025-12-31");
  assert.equal(exports.shiftSalesDate("2024-03-01", -1), "2024-02-29");
  assert.equal(exports.isValidSalesDate("2026-02-29"), false);
  assert.equal(exports.getJapanDateString(new Date("2026-10-16T14:59:59Z")), "2026-10-16");
});

for (const [name, response] of [
  ["query error", { data: null, count: null, error: { message: "denied" } }],
  ["partial result", { ...ok("2026-10-17", [100]), count: 2 }],
  ["unknown count", { ...ok("2026-10-17", [100]), count: null }],
  ["wrong date", ok("2026-10-16", [100])],
  ["invalid price", ok("2026-10-17", ["not-a-number"])],
  ["duplicate visit", { data: [rows("2026-10-17", [100])[0], rows("2026-10-17", [100])[0]], count: 2, error: null }],
]) {
  test(`${name} is not displayed as a daily amount`, async () => {
    const page = await mount({ respond: () => response });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(page.html(), /¥0|¥100|¥200|来店数 1件/);
  });
}

test("registered adjustments and null prices follow the existing visit total definition", async () => {
  const page = await mount({ respond: (date) => ok(date, [5000, -1000, null, "1500"]) });
  assert.match(page.html(), /¥5,500/);
  assert.match(page.html(), /来店数 4件/);
});
