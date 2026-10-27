// Run: node --test tests/customer-reservation-request-line.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL("../app/api/customer-reservations/[id]/route.ts", import.meta.url),
  "utf8"
);
const pageSource = readFileSync(
  new URL("../app/customer-app/reservations/[id]/page.tsx", import.meta.url),
  "utf8"
);
const retryLockSource = readFileSync(
  new URL(
    "../lib/customer-reservation-request-line-retry.ts",
    import.meta.url
  ),
  "utf8"
);
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const compiledRetryLock = ts.transpileModule(retryLockSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function loadRetryLockModule() {
  const exports = {};
  vm.runInNewContext(compiledRetryLock, {
    exports,
    require,
    Date,
    JSON,
    Number,
  });
  return exports;
}

function createMemoryStorage() {
  const entries = new Map();

  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
    removeItem(key) {
      entries.delete(key);
    },
    entries,
  };
}

class MockResponse {
  constructor(body, status = 200, headers = {}) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.headers = new Headers(headers);
  }

  async json() {
    return this.body;
  }

  async text() {
    return typeof this.body === "string" ? this.body : JSON.stringify(this.body);
  }
}

function createReadQuery(row, error = null) {
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return { data: row, error };
    },
  };
}

function loadRoute({
  lineResponses = [new MockResponse({}, 200)],
  lineConfigured = true,
  reservation,
  customerReadError = null,
  reservationReadError = null,
  staff = { id: "staff-1", name: "テスト担当" },
  staffReadError = null,
} = {}) {
  const lineCalls = [];
  const rpcCalls = [];
  const lineQueue = [...lineResponses];
  const defaultReservation = {
    id: "reservation-1",
    customer_id: "customer-1",
    salon_id: "salon-1",
    status: "confirmed",
    menu: "ワンカラー",
    start_at: "2099-10-02T01:30:00.000Z",
    updated_at: "2099-09-01T00:00:00.000Z",
    source: "customer-app",
    memo: "",
  };
  const supabaseAdmin = {
    from(table) {
      if (table === "customers") {
        return createReadQuery({
          id: "customer-1",
          name: "テスト顧客",
          salon_id: "salon-1",
          line_user_id: "line-user-1",
          line_login_id: "line-login-1",
        }, customerReadError);
      }
      if (table === "reservations") {
        return createReadQuery(
          reservation ?? defaultReservation,
          reservationReadError
        );
      }
      if (table === "staffs") {
        return createReadQuery(staff, staffReadError);
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });

      if (name === "cancel_customer_requested_reservation") {
        return {
          data: [{ outcome: "cancelled", reservation_id: "reservation-1" }],
          error: null,
        };
      }

      if (name === "update_customer_requested_reservation") {
        return {
          data: [{ outcome: "updated", reservation_id: "reservation-1" }],
          error: null,
        };
      }

      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const exports = {};

  vm.runInNewContext(compiledRoute, {
    exports,
    AbortSignal,
    Date,
    Error,
    Headers,
    Intl,
    Number,
    Promise,
    String,
    console: { error() {}, log() {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        ...(lineConfigured
          ? {
              LINE_CHANNEL_ACCESS_TOKEN: "line-token",
              LINE_ADMIN_USER_ID: "admin-user-1",
            }
          : {}),
      },
    },
    async fetch(url, options) {
      lineCalls.push({ url, options });
      const response = lineQueue.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error("No LINE response configured");
      return response;
    },
    require(name) {
      if (name === "next/server") {
        return {
          NextResponse: {
            json(body, options = {}) {
              return new MockResponse(body, options.status ?? 200);
            },
          },
        };
      }
      if (name === "@supabase/supabase-js") {
        return { createClient: () => supabaseAdmin };
      }
      if (name === "@/lib/server/lineLoginCookies") {
        return {
          LINE_SESSION_COOKIE: "line-session",
          readCustomerLineSessionCookie: () => ({
            customer_id: "customer-1",
            line_user_id: "line-login-1",
          }),
        };
      }
      if (name === "@/lib/server/customerReservationAvailability") {
        return {
          getCustomerReservationAvailability() {
            return {
              slots: [{ time: "10:30", staffIds: ["staff-1"] }],
            };
          },
          isValidCustomerBookingDate() {
            return true;
          },
          normalizeCustomerBookingDuration(value) {
            return Number(value);
          },
        };
      }
      return require(name);
    },
  });

  async function patch(body = {}) {
    const response = await exports.PATCH(
      {
        cookies: { get: () => ({ value: "signed-session" }) },
        async json() {
          return {
            action: "request_change",
            requestMessage: "10月3日の午後へ変更希望です",
            ...body,
          };
        },
      },
      { params: Promise.resolve({ id: "reservation-1" }) }
    );

    return { body: await response.json(), status: response.status };
  }

  async function get() {
    const response = await exports.GET(
      {
        cookies: { get: () => ({ value: "signed-session" }) },
      },
      { params: Promise.resolve({ id: "reservation-1" }) }
    );

    return { body: await response.json(), status: response.status };
  }

  return { get, lineCalls, patch, rpcCalls };
}

test("legacy full-width HPB reservations keep customer edits disabled", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      customer_id: "customer-1",
      salon_id: "salon-1",
      staff_id: null,
      status: "confirmed",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      end_at: "2099-10-02T02:30:00.000Z",
      updated_at: "2099-09-01T00:00:00.000Z",
      source: "",
      memo: "ＨＰＢ予約番号：Ａ１２３４５６",
    },
  });

  const detail = await runtime.get();
  assert.equal(detail.status, 200);
  assert.equal(detail.body.reservation.externalReservation, true);
  assert.equal(detail.body.reservation.canDirectEdit, false);
  assert.equal(detail.body.reservation.canRequestChange, false);

  const mutation = await runtime.patch();
  assert.equal(mutation.status, 400);
  assert.match(mutation.body.error, /予約元サービス/);
  assert.equal(runtime.rpcCalls.length, 0);
  assert.equal(runtime.lineCalls.length, 0);
});

test("confirmed change request succeeds only after LINE accepts it", async () => {
  const runtime = loadRoute();
  const response = await runtime.patch();

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.match(response.body.message, /変更希望を店舗へ送りました/);
  assert.equal(runtime.lineCalls.length, 1);
  assert.match(
    runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  assert.equal(runtime.lineCalls[0].options.signal.aborted, false);
});

test("customer lookup failure is an API error instead of a false signed-out response", async () => {
  const runtime = loadRoute({
    customerReadError: { message: "private database detail" },
  });

  const detail = await runtime.get();
  const mutation = await runtime.patch();

  for (const response of [detail, mutation]) {
    assert.equal(response.status, 500);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error, "顧客認証状態の確認に失敗しました");
    assert.doesNotMatch(response.body.error, /LINEログインが必要|private/);
  }
  assert.equal(runtime.rpcCalls.length, 0);
  assert.equal(runtime.lineCalls.length, 0);
});

test("reservation lookup failure is an API error without exposing database details", async () => {
  const runtime = loadRoute({
    reservationReadError: { message: "private reservation database detail" },
  });

  const response = await runtime.get();

  assert.equal(response.status, 500);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, "予約情報の取得に失敗しました");
  assert.doesNotMatch(response.body.error, /見つかりません|private/);
});

test("staff lookup failure is not displayed as an unassigned reservation", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      customer_id: "customer-1",
      salon_id: "salon-1",
      staff_id: "staff-1",
      status: "confirmed",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      source: "customer-app",
      memo: "",
    },
    staffReadError: { message: "private staff database detail" },
  });

  const response = await runtime.get();

  assert.equal(response.status, 500);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, "担当スタッフ情報の取得に失敗しました");
  assert.doesNotMatch(response.body.error, /指名なし|private/);
});

test("missing assigned staff is distinct from a reservation with no assignment", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      customer_id: "customer-1",
      salon_id: "salon-1",
      staff_id: "missing-staff",
      status: "confirmed",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      source: "customer-app",
      memo: "",
    },
    staff: null,
  });

  const response = await runtime.get();

  assert.equal(response.status, 200);
  assert.equal(response.body.reservation.staffId, "missing-staff");
  assert.equal(response.body.reservation.staffName, "担当者情報なし");
  assert.notEqual(response.body.reservation.staffName, "指名なし");
});

test("legacy full-width confirmed status keeps customer request actions available", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      customer_id: "customer-1",
      salon_id: "salon-1",
      status: " ＣＯＮＦＩＲＭＥＤ ",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      updated_at: "2099-09-01T00:00:00.000Z",
      source: "customer-app",
      memo: "",
    },
  });

  const detail = await runtime.get();
  assert.equal(detail.status, 200);
  assert.equal(detail.body.reservation.canRequestChange, true);
  assert.equal(detail.body.reservation.canRequestCancel, true);

  const request = await runtime.patch({
    action: "request_change",
    requestMessage: "別の日時を希望します",
  });
  assert.equal(request.status, 200);
  assert.equal(request.body.ok, true);
  assert.equal(runtime.lineCalls.length, 1);
});

test("legacy full-width requested status keeps customer direct actions available", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      customer_id: "customer-1",
      salon_id: "salon-1",
      status: " ＲＥＱＵＥＳＴＥＤ ",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      end_at: "2099-10-02T03:00:00.000Z",
      updated_at: "2099-09-01T00:00:00.000Z",
      source: "customer-app",
      memo: "",
    },
  });

  const detail = await runtime.get();
  assert.equal(detail.status, 200);
  assert.equal(detail.body.reservation.canDirectEdit, true);
  assert.equal(detail.body.reservation.canDirectCancel, true);
  assert.equal(detail.body.reservation.canRequestChange, false);
  assert.equal(detail.body.reservation.canRequestCancel, false);

  const cancellation = await runtime.patch({ action: "cancel" });
  assert.equal(cancellation.status, 200);
  assert.equal(cancellation.body.ok, true);
  assert.equal(
    runtime.rpcCalls[0].name,
    "cancel_customer_requested_reservation"
  );
});

test("legacy spaced requested status can update through the guarded RPC", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      customer_id: "customer-1",
      salon_id: "salon-1",
      status: " 予 約 申 請 中 ",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      end_at: "2099-10-02T03:00:00.000Z",
      updated_at: "2099-09-01T00:00:00.000Z",
      source: "customer-app",
      memo: "",
    },
  });

  const response = await runtime.patch({
    action: "update",
    date: "2099-10-03",
    time: "10:30",
    menu: "フレンチ",
    staffId: "staff-1",
    memo: "短め希望",
    durationMinutes: 90,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(
    runtime.rpcCalls[0].name,
    "update_customer_requested_reservation"
  );
});

test("LINE failure is not reported to the customer as a sent request", async () => {
  const runtime = loadRoute({
    lineResponses: [new MockResponse("temporary failure", 500)],
  });
  const response = await runtime.patch();

  assert.equal(response.status, 502);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.retryable, true);
  assert.equal(response.body.deliveryStatus, "failed");
  assert.match(response.body.error, /通知できませんでした/);
  assert.doesNotMatch(response.body.error, /送りました/);
});

test("missing LINE configuration fails closed without making an external call", async () => {
  const runtime = loadRoute({ lineConfigured: false });
  const response = await runtime.patch({ action: "request_cancel" });

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.retryable, false);
  assert.equal(response.body.deliveryStatus, "not_configured");
  assert.equal(runtime.lineCalls.length, 0);
});

test("retry reuses one key and treats LINE duplicate acceptance as sent", async () => {
  const runtime = loadRoute({
    lineResponses: [
      new Error("LINE response lost"),
      new MockResponse({}, 409, {
        "X-Line-Accepted-Request-Id": "accepted-request-1",
      }),
    ],
  });

  const first = await runtime.patch();
  const retried = await runtime.patch();

  assert.equal(first.status, 502);
  assert.equal(first.body.deliveryStatus, "unknown");
  assert.equal(first.body.retryable, true);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.ok, true);
  assert.match(retried.body.message, /重複送信していません/);
  assert.deepEqual(
    runtime.lineCalls.map((call) => call.options.headers["X-Line-Retry-Key"]),
    [
      runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
      runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
    ]
  );
  assert.equal(runtime.lineCalls[0].options.body, runtime.lineCalls[1].options.body);
});

test("requested cancellation stays saved and reports a LINE notification warning", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      customer_id: "customer-1",
      salon_id: "salon-1",
      status: "requested",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      source: "customer-app",
      memo: "",
    },
    lineResponses: [new MockResponse("temporary failure", 500)],
  });
  const response = await runtime.patch({ action: "cancel" });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.message, "予約希望を取り消しました");
  assert.equal(response.body.notificationStatus, "failed");
  assert.match(response.body.notificationWarning, /予約操作は完了/);
  assert.match(response.body.notificationWarning, /店舗LINEへ通知できませんでした/);
  assert.equal(runtime.rpcCalls[0].name, "cancel_customer_requested_reservation");
  assert.match(
    runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
    /^[0-9a-f-]{36}$/
  );
});

test("requested update stays saved when the LINE response is unknown", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      customer_id: "customer-1",
      salon_id: "salon-1",
      status: "requested",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      end_at: "2099-10-02T03:00:00.000Z",
      source: "customer-app",
      memo: "",
    },
    lineResponses: [new Error("LINE response lost")],
  });
  const response = await runtime.patch({
    action: "update",
    date: "2099-10-03",
    time: "10:30",
    menu: "フレンチ",
    staffId: "staff-1",
    memo: "短め希望",
    durationMinutes: 90,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.message, "予約希望を変更しました");
  assert.equal(response.body.notificationStatus, "unknown");
  assert.match(response.body.notificationWarning, /送信結果を確認できませんでした/);
  assert.equal(runtime.rpcCalls[0].name, "update_customer_requested_reservation");
  assert.match(
    runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
    /^[0-9a-f-]{36}$/
  );
});

test("customer page renders the notification warning separately from success", () => {
  assert.match(pageSource, /notificationWarning\?: string/);
  assert.match(
    pageSource,
    /setWarningMessage\(json\.notificationWarning \|\| ""\)/
  );
  assert.match(
    pageSource,
    /warningMessage[\s\S]{0,220}border-amber-200[\s\S]{0,180}\{warningMessage\}/
  );
});

test("customer page keeps a saved result visible when post-save refresh fails", () => {
  assert.match(
    pageSource,
    /fetchReservation\(\{ preserveCurrent: true \}\)/
  );
  assert.match(
    pageSource,
    /if \(!preserveCurrent\) \{[\s\S]{0,180}setReservation\(null\)[\s\S]{0,120}setStaffs\(\[\]\)/
  );
  assert.match(
    pageSource,
    /予約操作は完了しましたが、最新の予約情報を再取得できませんでした。画面を再読み込みしてください。/
  );
  assert.match(
    pageSource,
    /最新情報を再読み込み/
  );
  assert.match(
    pageSource,
    /disabled=\{saving \|\| Boolean\(refreshErrorMessage\)\}/
  );
});

test("successful customer LINE requests stay locked after a page reload", () => {
  const {
    CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS,
    getCustomerReservationRequestLineLock,
    readCustomerReservationRequestLineLock,
    saveCustomerReservationRequestLineLock,
  } = loadRetryLockModule();
  const storage = createMemoryStorage();

  for (const action of ["request_change", "request_cancel"]) {
    const lock = getCustomerReservationRequestLineLock(
      { ok: true, message: "店舗へ送りました" },
      action
    );
    assert.equal(lock.action, action);
    saveCustomerReservationRequestLineLock(
      storage,
      "reservation-1",
      lock,
      1_000
    );

    const restored = readCustomerReservationRequestLineLock(
      storage,
      "reservation-1",
      action,
      2_000
    );
    assert.equal(restored.action, action);
    assert.match(restored.message, /送信済み/);

    assert.equal(
      readCustomerReservationRequestLineLock(
        storage,
        "reservation-1",
        action,
        1_000 + CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS
      ),
      null
    );
  }
});

test("failed or unknown customer LINE requests remain safely retryable", () => {
  const { getCustomerReservationRequestLineLock } = loadRetryLockModule();

  assert.equal(
    getCustomerReservationRequestLineLock(
      { ok: false, message: "再試行してください" },
      "request_change"
    ),
    null
  );
});

test("customer reservation page restores separate change and cancel send locks", () => {
  assert.match(
    pageSource,
    /readCustomerReservationRequestLineLock\([\s\S]{0,100}window\.localStorage/
  );
  assert.match(pageSource, /saveCustomerReservationRequestLineLock\(/);
  assert.match(
    pageSource,
    /function restoreRequestLineLock[\s\S]{0,500}window\.localStorage/
  );
  assert.match(
    pageSource,
    /async function handleRequestChange\(\) \{[\s\S]{0,100}restoreRequestLineLock\("request_change"\)/
  );
  assert.match(
    pageSource,
    /async function handleRequestCancel\(\) \{[\s\S]{0,100}restoreRequestLineLock\("request_cancel"\)/
  );
  assert.match(
    pageSource,
    /requestLineLocks\.request_change \? \([\s\S]{0,700}変更希望を店舗へ送る/
  );
  assert.match(
    pageSource,
    /requestLineLocks\.request_cancel \? \([\s\S]{0,700}キャンセル希望を店舗へ送る/
  );
});

