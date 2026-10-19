// Run: node --test tests/reservation-alternative-request.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL(
    "../app/api/reservations/[id]/request-alternative/route.ts",
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
  authenticated = true,
  claims = [
    {
      claim_status: "claimed",
      attempt_count: 1,
      line_retry_key: "123e4567-e89b-12d3-a456-426614174000",
      line_message:
        "テスト顧客様\nhttps://preview.example.com/customer-app/reservations/reservation-1",
    },
  ],
  lineResponses = [new MockResponse({}, 200)],
  reservation,
  customer,
} = {}) {
  const authOptions = [];
  const completionCalls = [];
  const lineCalls = [];
  let clientCreated = false;
  const claimQueue = [...claims];
  const lineQueue = [...lineResponses];
  const defaultReservation = {
    id: "reservation-1",
    salon_id: "salon-1",
    customer_id: "customer-1",
    status: "requested",
    start_at: "2099-10-02T01:30:00.000Z",
    source: "customer-app",
    memo: "",
  };
  const defaultCustomer = {
    id: "customer-1",
    name: "テスト顧客",
    salon_id: "salon-1",
    line_user_id: "line-user-1",
  };
  const supabaseAdmin = {
    from(table) {
      if (table === "reservations") {
        return createReadQuery(reservation ?? defaultReservation);
      }
      if (table === "customers") {
        return createReadQuery(customer ?? defaultCustomer);
      }
      if (table === "salons") {
        return createReadQuery({ id: "salon-1", name: "Aily Nail Studio" });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    async rpc(name, args) {
      if (name === "claim_reservation_alternative_request") {
        const claim = claimQueue.shift();
        if (!claim) throw new Error("No claim response configured");
        return { data: [claim], error: null };
      }
      if (name === "complete_reservation_alternative_request") {
        completionCalls.push(args);
        return { data: true, error: null };
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
    URL,
    encodeURIComponent,
    console: { error() {} },
    process: {
      env: {
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
        NEXT_PUBLIC_APP_URL: "https://preview.example.com",
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
          NextRequest: class {},
          NextResponse: {
            json(body, options = {}) {
              return new MockResponse(body, options.status ?? 200);
            },
          },
        };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            clientCreated = true;
            return supabaseAdmin;
          },
        };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async (options) => {
            authOptions.push(options);
            return authenticated
              ? {
                  ok: true,
                  principal: {
                    authenticationMode: "supabase",
                    staffId: "staff-1",
                    salonId: "salon-1",
                    role: "staff",
                  },
                }
              : {
                  ok: false,
                  status: 401,
                  error: "スタッフ認証が必要です。",
                };
          },
        };
      }
      return require(name);
    },
  });

  async function post() {
    const response = await exports.POST(
      {},
      { params: Promise.resolve({ id: "reservation-1" }) }
    );
    return { body: await response.json(), status: response.status };
  }

  return {
    authOptions,
    completionCalls,
    get clientCreated() {
      return clientCreated;
    },
    lineCalls,
    post,
  };
}

test("rejects unauthenticated alternative-time requests before privileged work", async () => {
  const runtime = loadRoute({ authenticated: false });
  const response = await runtime.post();

  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
  assert.equal(runtime.clientCreated, false);
  assert.equal(runtime.lineCalls.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions[0])), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: false,
    salonContextRequired: true,
  });
});

test("sends the owned requested reservation with its stable LINE retry key", async () => {
  const runtime = loadRoute();
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.sent, true);
  assert.equal(runtime.lineCalls.length, 1);
  assert.equal(
    runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
    "123e4567-e89b-12d3-a456-426614174000"
  );
  assert.match(
    runtime.lineCalls[0].options.body,
    /https:\/\/preview\.example\.com\/customer-app\/reservations\/reservation-1/
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.completionCalls)),
    [
      {
        p_reservation_id: "reservation-1",
        p_attempt_count: 1,
        p_status: "sent",
        p_error: null,
      },
    ]
  );
});

test("does not call LINE again after the request is already sent", async () => {
  const runtime = loadRoute({
    claims: [
      {
        claim_status: "already_sent",
        attempt_count: 1,
        line_retry_key: "123e4567-e89b-12d3-a456-426614174000",
        line_message: "already sent",
      },
    ],
  });
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.alreadySent, true);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.completionCalls.length, 0);
});

test("records a failed send and retries with the same LINE retry key", async () => {
  const retryKey = "123e4567-e89b-12d3-a456-426614174000";
  const runtime = loadRoute({
    claims: [
      {
        claim_status: "claimed",
        attempt_count: 1,
        line_retry_key: retryKey,
        line_message: "same LINE payload",
      },
      {
        claim_status: "claimed",
        attempt_count: 2,
        line_retry_key: retryKey,
        line_message: "same LINE payload",
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
  assert.equal(retried.body.sent, true);
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

test("does not mark an unverified LINE conflict as sent", async () => {
  for (const headers of [{}, { "x-line-accepted-request-id": "   " }]) {
    const runtime = loadRoute({
      lineResponses: [new MockResponse("unverified conflict", 409, headers)],
    });
    const response = await runtime.post();

    assert.equal(response.status, 502);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.sent, false);
    assert.equal(response.body.retryable, false);
    assert.equal(runtime.lineCalls.length, 1);
    assert.equal(runtime.completionCalls[0].p_status, "failed");
    assert.equal(runtime.completionCalls[0].p_error, "unverified conflict");
  }
});

test("records a retryable failure even when the LINE error body cannot be read", async () => {
  const lineResponse = new MockResponse({}, 500);
  lineResponse.text = async () => {
    throw new Error("response stream interrupted");
  };
  const runtime = loadRoute({ lineResponses: [lineResponse] });
  const response = await runtime.post();

  assert.equal(response.status, 502);
  assert.equal(response.body.sent, false);
  assert.equal(response.body.retryable, true);
  assert.equal(runtime.completionCalls[0].p_status, "failed");
  assert.equal(
    runtime.completionCalls[0].p_error,
    "LINE API HTTP 500: response body unavailable"
  );
});

test("rejects reservations belonging to another salon before claiming or sending", async () => {
  const runtime = loadRoute({
    reservation: {
      id: "reservation-1",
      salon_id: "other-salon",
      customer_id: "customer-1",
      status: "requested",
      start_at: "2099-10-02T01:30:00.000Z",
      source: "customer-app",
      memo: "",
    },
  });
  const response = await runtime.post();

  assert.equal(response.status, 403);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.completionCalls.length, 0);
});

test("migration protects the delivery ledger and customer updates close its state", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261003120111_reservation_alternative_requests.sql",
      import.meta.url
    ),
    "utf8"
  );
  const customerRoute = readFileSync(
    new URL("../app/api/customer-reservations/[id]/route.ts", import.meta.url),
    "utf8"
  );
  const reservationWriteMigration = readFileSync(
    new URL(
      "../supabase/migrations/20261004030707_prevent_customer_reservation_races.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    migration,
    /alter table public\.reservation_alternative_requests enable row level security/i
  );
  assert.match(
    migration,
    /revoke all on table public\.reservation_alternative_requests from authenticated/i
  );
  assert.match(migration, /claim_reservation_alternative_request/);
  assert.match(migration, /for update/);
  assert.match(migration, /interval '23 hours'/);
  assert.match(
    migration,
    /v_request\.status = 'sent'[\s\S]*v_request\.message is not distinct from p_message/
  );
  assert.match(migration, /if v_request\.status in \('sent', 'responded'\)/);
  assert.match(migration, /line_retry_key = gen_random_uuid\(\)/);
  assert.match(
    migration,
    /v_current_status in \('responded', 'superseded'\)/
  );
  assert.match(
    customerRoute,
    /rpc\(\s*"update_customer_requested_reservation"/
  );
  assert.match(
    customerRoute,
    /rpc\(\s*"cancel_customer_requested_reservation"/
  );
  assert.match(customerRoute, /p_expected_start_at: previousStartAt \|\| null/);
  assert.doesNotMatch(customerRoute, /status: "superseded"/);
  assert.match(
    customerRoute,
    /予約状態が更新されています。最新の内容を読み込み直してください/
  );
  assert.match(
    customerRoute,
    /getCustomerReservationAvailability\(\{[\s\S]*excludeReservationId: id,[\s\S]*\}\)/
  );
  assert.match(customerRoute, /isValidCustomerBookingDate\(date\)/);
  assert.match(
    customerRoute,
    /normalizeCustomerBookingDuration\([\s\S]*body\.durationMinutes/
  );
  assert.doesNotMatch(customerRoute, /\.from\("external_calendar_blocks"\)/);
  assert.match(
    reservationWriteMigration,
    /lock table public\.reservations in share row exclusive mode/i
  );
  assert.match(
    reservationWriteMigration,
    /create function public\.update_customer_requested_reservation/i
  );
  assert.match(
    reservationWriteMigration,
    /create function public\.cancel_customer_requested_reservation/i
  );
  assert.match(
    reservationWriteMigration,
    /reservation\.start_at is not distinct from p_expected_start_at/i
  );
  assert.match(
    reservationWriteMigration,
    /request\.status in \('pending', 'sending', 'sent', 'failed'\)/i
  );
  assert.match(
    reservationWriteMigration,
    /grant execute on function public\.update_customer_requested_reservation[\s\S]*to service_role/i
  );
  assert.match(
    reservationWriteMigration,
    /cancel_customer_requested_reservation[\s\S]*request\.status in \('pending', 'sending', 'sent', 'failed'\)[\s\S]*return query select 'cancelled'/i
  );
  assert.match(
    reservationWriteMigration,
    /grant execute on function public\.cancel_customer_requested_reservation[\s\S]*to service_role/i
  );
});

test("staff UI synchronously locks confirmation and alternative LINE actions", () => {
  const pageSource = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  for (const functionName of [
    "retryConfirmationLine",
    "requestAlternativeTime",
  ]) {
    const functionStart = pageSource.indexOf(`async function ${functionName}()`);
    assert.notEqual(functionStart, -1, `${functionName} exists`);

    const nextFunction = pageSource.indexOf("\n  async function ", functionStart + 1);
    const functionSource = pageSource.slice(
      functionStart,
      nextFunction === -1 ? undefined : nextFunction
    );

    assert.match(
      functionSource,
      /if \(!reservationId \|\| confirmRequestPendingRef\.current\) return;/
    );
    assert.match(functionSource, /confirmRequestPendingRef\.current = true;/);
    assert.match(
      functionSource,
      /finally \{[\s\S]*confirmRequestPendingRef\.current = false;/
    );
  }
});
