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
  const lineCalls = [];
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
  };
  const supabaseAdmin = {
    from(table) {
      if (table === "reservations") {
        return createReadQuery(reservation ?? defaultReservation);
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
        return { reservationId: "reservation-1" };
      },
    });
    return { body: await response.json(), status: response.status };
  }

  return { completionCalls, lineCalls, post };
}

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
    /if \(result\.confirmed \|\| result\.alreadyConfirmed\) \{[\s\S]{0,120}await sendReservationConfirmedLine\(id\)/
  );
  assert.match(
    editPage,
    /if \(confirmation\.confirmed \|\| confirmation\.alreadyConfirmed\) \{[\s\S]{0,180}\/api\/send-reservation-confirmed-line/
  );
  assert.match(listPage, /response\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(
    editPage,
    /confirmationResponse\s*\.json\(\)\s*\.catch\(\(\) => null\)/
  );
});
