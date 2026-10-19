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
const reservationStatusExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../lib/reservation-status.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { exports: reservationStatusExports, Set, String }
);
const source = readFileSync(new URL("../app/customers/[id]/page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const booking = (overrides = {}) => ({
  id: "booking-1", customer_id: "customer-1", staff_id: "staff-1",
  start_at: "2099-10-02T01:30:00", status: "confirmed", menu: "テストメニュー",
  ...overrides,
});

async function loadPage({ reservations = [], reservationError = null, rejectReservations = false,
  staffs = [{ id: "staff-1", name: "テスト担当" }], staffError = null } = {}) {
  const requests = [];
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
    useRef: (initial) => ({ current: initial }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: (fn) => { effects.push(fn); },
  };
  const supabase = {
    from(table) {
      throw new Error(`Unexpected browser database read: ${table}`);
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/reservation-status") return reservationStatusExports;
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
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (rejectReservations) throw new Error("network unavailable");
      if (reservationError || staffError) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "customer_detail_failed" }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          customer: { id: "customer-1", name: "テスト顧客", name_kana: null, phone: null },
          visits: [],
          visitPayments: [],
          visitPhotos: [],
          reservations,
          staffs: reservations.some((reservation) => reservation.staff_id) ? staffs : [],
          customerIntakes: [],
        }),
      };
    },
  }, { filename: "customer-detail-page.js" });
  const render = () => {
    cursor = 0;
    return renderToStaticMarkup(exports.default());
  };
  assert.match(render(), /読み込み中/);
  for (const effect of effects.splice(0)) effect();
  // The mocked API resolves as microtasks; let the page's async chain settle.
  await setImmediate();
  const html = render();
  assert.doesNotMatch(html, /読み込み中/);
  return { html, requests, errors };
}

test("reservation query failure shows an alert, never a false empty state", async () => {
  const { html } = await loadPage({ reservationError: { code: "42703" } });
  assert.match(html, /role="alert"/);
  assert.match(html, /顧客詳細を取得できませんでした/);
  assert.doesNotMatch(html, /次回予約は未登録です/);
});

test("rejected reservation request also stays distinct from no booking", async () => {
  const { html } = await loadPage({ rejectReservations: true });
  assert.match(html, /顧客詳細を取得できませんでした/);
  assert.doesNotMatch(html, /次回予約は未登録です/);
});

test("successful empty result shows no booking and skips staff lookup", async () => {
  const { html, requests } = await loadPage();
  assert.match(html, /次回予約は未登録です/);
  assert.doesNotMatch(html, /次回予約を確認できませんでした/);
  assert.equal(requests.length, 1);
});

test("confirmed schema returns the menu, staff and JST date/time", async () => {
  const { html, requests, errors } = await loadPage({ reservations: [booking()] });
  assert.equal(errors.length, 0);
  assert.match(html, /テストメニュー/);
  assert.match(html, /テスト担当/);
  assert.match(html, /10\/2/);
  assert.match(html, /10:30/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/customers/customer-1/detail");
});

test("missing staff assignment preserves booking and skips staff lookup", async () => {
  const { html, requests } = await loadPage({ reservations: [booking({ staff_id: null })] });
  assert.match(html, /テストメニュー/);
  assert.match(html, /担当: -/);
  assert.equal(requests.length, 1);
});

test("staff lookup failure blocks an incomplete customer detail", async () => {
  const { html } = await loadPage({ reservations: [booking()], staffError: { code: "42501" } });
  assert.match(html, /role="alert"/);
  assert.match(html, /顧客詳細を取得できませんでした/);
  assert.doesNotMatch(html, /テストメニュー|担当: -|次回予約は未登録です/);
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
