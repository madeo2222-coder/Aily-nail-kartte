// Run: node --test tests/customer-reservations.test.mjs
// Executes the real page's fetch/render logic with in-memory data only.
// Hook scheduling, authentication, RLS and browser interaction are not covered.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/customers/[id]/page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Columns confirmed by the owner from information_schema on 2026-09-27.
const columns = {
  reservations: new Set("id salon_id customer_id staff_id menu start_at end_at status memo created_at".split(" ")),
  staffs: new Set("id salon_id name role email phone created_at user_id customer_booking_enabled is_active".split(" ")),
};
const booking = (overrides = {}) => ({
  id: "booking-1", customer_id: "customer-1", staff_id: "staff-1",
  start_at: "2099-10-02T01:30:00", status: "confirmed", menu: "テストメニュー",
  ...overrides,
});

async function loadPage({ reservations = [], reservationError = null, rejectReservations = false,
  staffs = [{ id: "staff-1", name: "テスト担当" }], staffError = null } = {}) {
  const queries = [];
  const states = [];
  const effects = [];
  const errors = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: (fn) => { effects.push(fn); },
  };
  const supabase = {
    from(table) {
      const query = { table, filters: [] };
      queries.push(query);
      const chain = {
        select(value) { query.columns = value; return chain; },
        eq(key, value) { query.filters.push([key, value]); return chain; },
        in(key, value) { query.filters.push([key, Array.from(value)]); return chain; },
        order() { return chain; },
        single() { return chain; },
        then(resolve, reject) {
          if (table === "reservations" && rejectReservations) {
            return Promise.reject(new Error("network unavailable")).then(resolve, reject);
          }
          if (columns[table]) {
            const unknown = query.columns.split(",").map((value) => value.trim())
              .find((value) => !columns[table].has(value));
            if (unknown) return Promise.resolve({ data: null, error: { code: "42703", message: `missing column ${unknown}` } }).then(resolve, reject);
          }
          const responses = {
            customers: { data: { id: "customer-1", name: "テスト顧客", name_kana: null, phone: null }, error: null },
            visits: { data: [], error: null },
            customer_intakes: { data: [], error: null },
            reservations: { data: reservationError ? null : reservations, error: reservationError },
            staffs: { data: staffError ? null : staffs, error: staffError },
          };
          assert.ok(table in responses, `Unexpected query: ${table}`);
          return Promise.resolve(responses[table]).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/supabase") return { supabase };
      if (name === "next/link") return { default: "a" };
      if (name === "next/image") {
        return {
          default: (props) => {
            const imageProps = { ...props };
            delete imageProps.unoptimized;
            return require("react").createElement("img", imageProps);
          },
        };
      }
      if (name === "next/navigation") return {
        useParams: () => ({ id: "customer-1" }),
        useRouter: () => ({ push() { assert.fail("Unexpected navigation"); } }),
      };
      throw new Error(`Unexpected import: ${name}`);
    },
    console: { error: (...args) => errors.push(args) },
    alert: () => {},
  }, { filename: "customer-detail-page.js" });
  const render = () => {
    cursor = 0;
    return renderToStaticMarkup(exports.default());
  };
  assert.match(render(), /読み込み中/);
  for (const effect of effects.splice(0)) effect();
  // All mocked queries resolve as microtasks; let the page's async chain settle.
  await setImmediate();
  const html = render();
  assert.doesNotMatch(html, /読み込み中/);
  return { html, queries, errors };
}

test("reservation query failure shows an alert, never a false empty state", async () => {
  const { html } = await loadPage({ reservationError: { code: "42703" } });
  assert.match(html, /role="alert"/);
  assert.match(html, /次回予約を確認できませんでした/);
  assert.doesNotMatch(html, /次回予約は未登録です/);
});

test("rejected reservation request also stays distinct from no booking", async () => {
  const { html } = await loadPage({ rejectReservations: true });
  assert.match(html, /次回予約を確認できませんでした/);
  assert.doesNotMatch(html, /次回予約は未登録です/);
});

test("successful empty result shows no booking and skips staff lookup", async () => {
  const { html, queries } = await loadPage();
  assert.match(html, /次回予約は未登録です/);
  assert.doesNotMatch(html, /次回予約を確認できませんでした/);
  assert.ok(!queries.some((query) => query.table === "staffs"));
});

test("confirmed schema returns the menu, staff and JST date/time", async () => {
  const { html, queries, errors } = await loadPage({ reservations: [booking()] });
  assert.equal(errors.length, 0);
  assert.match(html, /テストメニュー/);
  assert.match(html, /テスト担当/);
  assert.match(html, /10\/2/);
  assert.match(html, /10:30/);
  assert.deepEqual(queries.find((q) => q.table === "reservations").filters, [["customer_id", "customer-1"]]);
  assert.deepEqual(queries.find((q) => q.table === "staffs").filters, [["id", ["staff-1"]]]);
});

test("missing staff assignment preserves booking and skips staff lookup", async () => {
  const { html, queries } = await loadPage({ reservations: [booking({ staff_id: null })] });
  assert.match(html, /テストメニュー/);
  assert.match(html, /担当: -/);
  assert.ok(!queries.some((q) => q.table === "staffs"));
});

test("staff lookup failure does not hide a successfully loaded booking", async () => {
  const { html } = await loadPage({ reservations: [booking()], staffError: { code: "42501" } });
  assert.match(html, /テストメニュー/);
  assert.match(html, /担当: -/);
  assert.doesNotMatch(html, /次回予約は未登録です|次回予約を確認できませんでした/);
});

test("next booking excludes cancelled/completed rows and selects earliest active row", async () => {
  const { html } = await loadPage({ reservations: [
    booking({ id: "cancelled", status: "キャンセル", start_at: "2099-10-01T00:00:00", menu: "取消メニュー" }),
    booking({ id: "completed", status: "completed", start_at: "2099-10-01T00:00:00", menu: "完了メニュー" }),
    booking({ id: "later", start_at: "2099-10-03T00:00:00", menu: "後日メニュー" }),
    booking(),
  ] });
  assert.match(html, /テストメニュー/);
  assert.doesNotMatch(html, /取消メニュー|完了メニュー|後日メニュー/);
});
