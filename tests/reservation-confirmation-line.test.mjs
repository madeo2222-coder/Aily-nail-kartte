// Run: node --test tests/reservation-confirmation-line.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL("../app/api/send-reservation-confirmed-line/route.ts", import.meta.url),
  "utf8"
);
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

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

function createReadQuery(row, error = null, calls = null) {
  return {
    select(columns) {
      calls?.push(["select", columns]);
      return this;
    },
    eq(column, value) {
      calls?.push(["eq", column, value]);
      return this;
    },
    async maybeSingle() {
      return { data: row, error };
    },
  };
}

function loadRoute({
  requestBody = { reservationId: "reservation-1" },
  requestJsonError = null,
  claimError = null,
  claims = [
    {
      claim_status: "claimed",
      attempt_count: 1,
      line_retry_key: "123e4567-e89b-12d3-a456-426614174000",
      line_message: "stable confirmation payload",
    },
  ],
  lineResponses = [new MockResponse({}, 200)],
  completionResult = { data: true, error: null },
  reservation,
} = {}) {
  const completionCalls = [];
  const claimCalls = [];
  const lineCalls = [];
  const reservationReadCalls = [];
  const claimQueue = [...claims];
  const lineQueue = [...lineResponses];
  const defaultReservation = {
    id: "reservation-1",
    salon_id: "salon-1",
    customer_id: "customer-1",
    staff_id: "staff-1",
    status: "confirmed",
    menu: "ワンカラー",
    start_at: "2099-10-02T01:30:00.000Z",
    end_at: "2099-10-02T03:00:00.000Z",
    source: null,
    memo: null,
  };
  const supabaseAdmin = {
    from(table) {
      if (table === "reservations") {
        return createReadQuery(
          reservation ?? defaultReservation,
          null,
          reservationReadCalls
        );
      }
      if (table === "customers") {
        return createReadQuery({
          id: "customer-1",
          name: "テスト顧客",
          salon_id: "salon-1",
          line_user_id: "line-user-1",
        });
      }
      if (table === "staffs") {
        return createReadQuery({ id: "staff-1", name: "担当者" });
      }
      if (table === "salons") {
        return createReadQuery({ id: "salon-1", name: "Aily Nail Studio" });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    async rpc(name, args) {
      if (name === "claim_reservation_confirmation_delivery") {
        claimCalls.push(args);
        if (claimError) return { data: null, error: claimError };
        const claim = claimQueue.shift();
        if (!claim) throw new Error("No claim response configured");
        return { data: [claim], error: null };
      }
      if (name === "complete_reservation_confirmation_delivery") {
        completionCalls.push(args);
        if (completionResult instanceof Error) throw completionResult;
        return completionResult;
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
    Intl,
    Number,
    Promise,
    String,
    console: { error() {} },
    process: {
      env: {
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
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
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async () => ({
            ok: true,
            principal: {
              authenticationMode: "supabase",
              staffId: "staff-1",
              salonId: "salon-1",
              role: "staff",
            },
          }),
        };
      }
      return require(name);
    },
  });

  async function post() {
    const response = await exports.POST({
      async json() {
        if (requestJsonError) throw requestJsonError;
        return requestBody;
      },
    });
    return { body: await response.json(), status: response.status };
  }

  return {
    claimCalls,
    completionCalls,
    lineCalls,
    post,
    reservationReadCalls,
  };
}

test("scopes the initial confirmation LINE read to the authenticated staff salon", async () => {
  const runtime = loadRoute();
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.deepEqual(runtime.reservationReadCalls, [
    [
      "select",
      "id, salon_id, customer_id, staff_id, status, menu, start_at, end_at, source, memo",
    ],
    ["eq", "id", "reservation-1"],
    ["eq", "salon_id", "salon-1"],
  ]);
});

test("rejects malformed confirmation LINE requests before privileged reads or sends", async () => {
  for (const options of [
    { requestJsonError: new SyntaxError("private parser detail") },
    { requestBody: null },
    { requestBody: [] },
    { requestBody: { reservationId: 123 } },
    { requestBody: { reservationId: "   " } },
  ]) {
    const runtime = loadRoute(options);
    const response = await runtime.post();

    assert.equal(response.status, 400);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.sent, false);
    assert.match(response.body.error, /予約ID|予約内容/);
    assert.doesNotMatch(response.body.error, /private/);
    assert.equal(runtime.lineCalls.length, 0);
    assert.equal(runtime.completionCalls.length, 0);
  }
});

test("does not expose internal confirmation delivery errors", async () => {
  const runtime = loadRoute({
    claimError: { message: "private database function detail" },
  });
  const response = await runtime.post();

  assert.equal(response.status, 500);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.sent, false);
  assert.match(response.body.error, /通知状態を確認/);
  assert.doesNotMatch(response.body.error, /private|database function/);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.completionCalls.length, 0);
});

test("maps known confirmation delivery claim failures to staff actions", async () => {
  const cases = [
    {
      message: "CONFIRMATION_DELIVERY_INVALID_STAFF",
      status: 403,
      expected: /権限/,
      responseStatus: undefined,
    },
    {
      message: "CONFIRMATION_DELIVERY_SCOPE_MISMATCH",
      status: 403,
      expected: /権限/,
      responseStatus: undefined,
    },
    {
      message: "CONFIRMATION_DELIVERY_INVALID_RESERVATION",
      status: 409,
      expected: /読み込み直して/,
      responseStatus: "reservation_changed",
    },
    {
      message: "CONFIRMATION_DELIVERY_MESSAGE_CHANGED",
      status: 409,
      expected: /送信履歴/,
      responseStatus: "message_changed",
    },
  ];

  for (const claimFailure of cases) {
    const runtime = loadRoute({
      claimError: { message: `private detail: ${claimFailure.message}` },
    });
    const response = await runtime.post();

    assert.equal(response.status, claimFailure.status);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.sent, false);
    assert.equal(response.body.status, claimFailure.responseStatus);
    assert.match(response.body.error, claimFailure.expected);
    assert.doesNotMatch(response.body.error, /private|CONFIRMATION_DELIVERY_/);
    assert.equal(runtime.lineCalls.length, 0);
    assert.equal(runtime.completionCalls.length, 0);
  }
});

test("sends a confirmed reservation with the claimed LINE retry key", async () => {
  const runtime = loadRoute();
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.sent, true);
  assert.equal(runtime.lineCalls.length, 1);
  assert.equal(
    runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
    "123e4567-e89b-12d3-a456-426614174000"
  );
  assert.equal(runtime.completionCalls[0].p_status, "sent");
});

test("rejects an over-limit confirmation message before claiming or sending", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      salon_id: "salon-1",
      customer_id: "customer-1",
      staff_id: "staff-1",
      status: "confirmed",
      menu: "😀".repeat(2_501),
      start_at: "2099-10-02T01:30:00.000Z",
      end_at: "2099-10-02T03:00:00.000Z",
      source: null,
      memo: null,
    },
  });
  const response = await runtime.post();

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.sent, false);
  assert.equal(response.body.status, "message_too_long");
  assert.match(response.body.error, /長すぎます/);
  assert.equal(runtime.claimCalls.length, 0);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.completionCalls.length, 0);
});

test("sends confirmation LINE for legacy full-width and spaced confirmed statuses", async () => {
  for (const status of [" ＣＯＮＦＩＲＭＥＤ ", " 予 約 確 定 "]) {
    const runtime = loadRoute({
      reservation: {
        id: "reservation-1",
        salon_id: "salon-1",
        customer_id: "customer-1",
        staff_id: "staff-1",
        status,
        menu: "ワンカラー",
        start_at: "2099-10-02T01:30:00.000Z",
        end_at: "2099-10-02T03:00:00.000Z",
        source: null,
        memo: null,
      },
    });
    const response = await runtime.post();

    assert.equal(response.status, 200, status);
    assert.equal(response.body.sent, true, status);
    assert.equal(runtime.lineCalls.length, 1, status);
    assert.equal(runtime.completionCalls[0].p_status, "sent", status);
  }
});

test("does not send LINE again after a confirmation was already sent", async () => {
  const runtime = loadRoute({
    claims: [
      {
        claim_status: "already_sent",
        attempt_count: 1,
        line_retry_key: "123e4567-e89b-12d3-a456-426614174000",
        line_message: "stable confirmation payload",
      },
    ],
  });
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.alreadySent, true);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.completionCalls.length, 0);
});

test("blocks an over-limit claimed confirmation payload before calling LINE", async () => {
  const runtime = loadRoute({
    claims: [
      {
        claim_status: "claimed",
        attempt_count: 2,
        line_retry_key: "123e4567-e89b-12d3-a456-426614174000",
        line_message: "😀".repeat(2_501),
      },
    ],
  });
  const response = await runtime.post();

  assert.equal(response.status, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.sent, false);
  assert.equal(response.body.status, "message_too_long");
  assert.equal(response.body.retryable, false);
  assert.match(response.body.error, /長すぎるため送信していません/);
  assert.equal(runtime.claimCalls.length, 1);
  assert.equal(runtime.lineCalls.length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.completionCalls)),
    [
      {
        p_reservation_id: "reservation-1",
        p_attempt_count: 2,
        p_status: "failed",
        p_error: "LINE message exceeds 5000 UTF-16 code units",
      },
    ]
  );
});

test("does not send Naily confirmation LINE for a legacy external reservation", async () => {
  for (const reservation of [
    {
      id: "reservation-1",
      salon_id: "salon-1",
      customer_id: "customer-1",
      staff_id: "staff-1",
      status: "confirmed",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      end_at: "2099-10-02T03:00:00.000Z",
      source: "ＭＩＮＩＭＯ",
      memo: null,
    },
    {
      id: "reservation-1",
      salon_id: "salon-1",
      customer_id: "customer-1",
      staff_id: "staff-1",
      status: "confirmed",
      menu: "ワンカラー",
      start_at: "2099-10-02T01:30:00.000Z",
      end_at: "2099-10-02T03:00:00.000Z",
      source: null,
      memo: "ＨＰＢ予約番号：Ａ１２３４５６",
    },
  ]) {
    const runtime = loadRoute({ reservation });
    const response = await runtime.post();

    assert.equal(response.status, 409);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.sent, false);
    assert.match(response.body.error, /HPB・ミニモ/);
    assert.equal(runtime.lineCalls.length, 0);
    assert.equal(runtime.completionCalls.length, 0);
  }
});

test("does not invite a retry when a confirmation network failure cannot be recorded", async () => {
  for (const completionResult of [
    { data: false, error: null },
    { data: null, error: { message: "private database detail" } },
    new Error("private connection detail"),
  ]) {
    const runtime = loadRoute({
      lineResponses: [new Error("LINE response lost")],
      completionResult,
    });
    const response = await runtime.post();

    assert.equal(response.status, 500);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.sent, false);
    assert.equal(response.body.status, "unknown");
    assert.equal(response.body.retryable, false);
    assert.match(response.body.error, /再送せず/);
    assert.doesNotMatch(response.body.error, /private/);
    assert.equal(runtime.lineCalls.length, 1);
    assert.equal(runtime.completionCalls.length, 1);
    assert.equal(runtime.completionCalls[0].p_status, "failed");
  }
});

test("keeps confirmation retry available after a recorded network failure", async () => {
  const runtime = loadRoute({ lineResponses: [new Error("LINE timeout")] });
  const response = await runtime.post();

  assert.equal(response.status, 502);
  assert.equal(response.body.status, "failed");
  assert.equal(response.body.retryable, true);
  assert.equal(runtime.lineCalls.length, 1);
  assert.equal(runtime.completionCalls[0].p_attempt_count, 1);
});

test("does not resend after confirmation LINE succeeds but its delivery record cannot be saved", async () => {
  for (const completionResult of [
    { data: false, error: null },
    { data: null, error: { message: "private database detail" } },
    new Error("private connection detail"),
  ]) {
    const runtime = loadRoute({ completionResult });
    const response = await runtime.post();

    assert.equal(response.status, 500);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.sent, true);
    assert.equal(response.body.status, "sent_unrecorded");
    assert.equal(response.body.retryable, false);
    assert.match(response.body.error, /LINEは送信されました/);
    assert.match(response.body.error, /再送せず/);
    assert.doesNotMatch(response.body.error, /private/);
    assert.equal(runtime.lineCalls.length, 1);
    assert.equal(runtime.completionCalls.length, 1);
    assert.equal(runtime.completionCalls[0].p_status, "sent");
  }
});

test("records failure and safely retries with the same LINE retry key", async () => {
  const retryKey = "123e4567-e89b-12d3-a456-426614174000";
  const runtime = loadRoute({
    claims: [
      {
        claim_status: "claimed",
        attempt_count: 1,
        line_retry_key: retryKey,
        line_message: "stable confirmation payload",
      },
      {
        claim_status: "claimed",
        attempt_count: 2,
        line_retry_key: retryKey,
        line_message: "stable confirmation payload",
      },
    ],
    lineResponses: [
      new MockResponse("temporary LINE error", 500),
      new MockResponse({}, 409, {
        "X-Line-Accepted-Request-Id": "accepted-request-1",
      }),
    ],
  });

  const failed = await runtime.post();
  const retried = await runtime.post();

  assert.equal(failed.status, 502);
  assert.equal(failed.body.retryable, true);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.retried, true);
  assert.deepEqual(
    runtime.lineCalls.map((call) => call.options.headers["X-Line-Retry-Key"]),
    [retryKey, retryKey]
  );
  assert.equal(runtime.lineCalls[0].options.body, runtime.lineCalls[1].options.body);
  assert.deepEqual(
    runtime.completionCalls.map((call) => [call.p_attempt_count, call.p_status]),
    [
      [1, "failed"],
      [2, "sent"],
    ]
  );
});

test("rejects a confirmed reservation belonging to another salon", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      salon_id: "other-salon",
      customer_id: "customer-1",
      staff_id: "staff-1",
      status: "confirmed",
      menu: null,
      start_at: null,
      end_at: null,
      source: null,
      memo: null,
    },
  });
  const response = await runtime.post();

  assert.equal(response.status, 403);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.completionCalls.length, 0);
});

test("migration and staff screens preserve idempotent retry controls", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261004070432_reservation_confirmation_deliveries.sql",
      import.meta.url
    ),
    "utf8"
  );
  const listPage = readFileSync(
    new URL("../app/reservations/ReservationsPageClient.tsx", import.meta.url),
    "utf8"
  );
  const editPage = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(migration, /reservation_confirmation_deliveries enable row level security/i);
  assert.match(migration, /revoke all on table public\.reservation_confirmation_deliveries from authenticated/i);
  assert.match(migration, /claim_reservation_confirmation_delivery/);
  assert.match(migration, /for update/);
  assert.match(migration, /interval '23 hours'/);
  assert.match(migration, /if v_delivery\.status = 'sent'/);
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(migration, /grant execute on function public\.claim_reservation_confirmation_delivery[\s\S]*to service_role/i);
  assert.match(listPage, /確定LINEを再試行/);
  assert.match(editPage, /確定LINEを再試行/);
  assert.match(
    listPage,
    /if \(result\.confirmed \|\| result\.alreadyConfirmed\) \{[\s\S]{0,160}await sendReservationConfirmedLine\(reservation\.id\)/
  );
  assert.match(
    editPage,
    /if \(confirmation\.confirmed \|\| confirmation\.alreadyConfirmed\) \{[\s\S]{0,180}\/api\/send-reservation-confirmed-line/
  );
  assert.match(
    listPage,
    /response\.json\(\)\.catch\([\s\S]{0,40}\(\) => null[\s\S]{0,10}\)/
  );
  assert.match(
    editPage,
    /confirmationResponse\s*\.json\(\)\s*\.catch\(\(\) => null\)/
  );
  assert.match(
    editPage,
    /if \(!lineRes\.ok \|\| lineData\?\.error\) \{[\s\S]{0,180}else if \(lineData\?\.sent\)/
  );
});
