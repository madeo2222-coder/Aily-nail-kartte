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
  completionResult = { data: true, error: null },
  claimError = null,
  reservation,
  customer,
} = {}) {
  const authOptions = [];
  const claimCalls = [];
  const completionCalls = [];
  const lineCalls = [];
  let clientCreated = false;
  const claimQueue = [...claims];
  const lineQueue = [...lineResponses];
  const defaultReservation = {
    id: "reservation-1",
    salon_id: "salon-1",
    customer_id: "customer-1",
    staff_id: "staff-1",
    menu: "ワンカラー",
    status: "requested",
    start_at: "2099-10-02T01:30:00.000Z",
    end_at: "2099-10-02T02:30:00.000Z",
    source: "customer-app",
    memo: "",
  };
  const defaultSnapshot = {
    expectedCustomerId: defaultReservation.customer_id,
    expectedStaffId: defaultReservation.staff_id,
    expectedMenu: defaultReservation.menu,
    expectedStartAt: defaultReservation.start_at,
    expectedEndAt: defaultReservation.end_at,
    expectedStatus: defaultReservation.status,
    expectedMemo: defaultReservation.memo,
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
        claimCalls.push(args);
        if (claimError) return { data: null, error: claimError };
        const claim = claimQueue.shift();
        if (!claim) throw new Error("No claim response configured");
        return { data: [claim], error: null };
      }
      if (name === "complete_reservation_alternative_request") {
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

  async function post(body = defaultSnapshot) {
    const response = await exports.POST(
      {
        async json() {
          if (body instanceof Error) throw body;
          return body;
        },
      },
      { params: Promise.resolve({ id: "reservation-1" }) }
    );
    return { body: await response.json(), status: response.status };
  }

  return {
    authOptions,
    claimCalls,
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

test("rejects a legacy full-width HPB reservation before claiming or sending", async () => {
  const reservation = {
    id: "reservation-1",
    salon_id: "salon-1",
    customer_id: "customer-1",
    staff_id: "staff-1",
    menu: "ワンカラー",
    status: "requested",
    start_at: "2099-10-02T01:30:00.000Z",
    end_at: "2099-10-02T02:30:00.000Z",
    source: "",
    memo: "ＨＰＢ予約番号：Ａ１２３４５６",
  };
  const runtime = loadRoute({ reservation });
  const response = await runtime.post({
    expectedCustomerId: reservation.customer_id,
    expectedStaffId: reservation.staff_id,
    expectedMenu: reservation.menu,
    expectedStartAt: reservation.start_at,
    expectedEndAt: reservation.end_at,
    expectedStatus: reservation.status,
    expectedMemo: reservation.memo,
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /外部予約/);
  assert.equal(runtime.claimCalls.length, 0);
  assert.equal(runtime.lineCalls.length, 0);
});

test("requires the complete reservation snapshot before privileged work", async () => {
  for (const body of [
    new Error("missing body"),
    {},
    { expectedCustomerId: "customer-1" },
    {
      expectedCustomerId: "customer-1",
      expectedStaffId: "staff-1",
      expectedMenu: "ワンカラー",
      expectedStartAt: "2099-10-02T01:30:00.000Z",
      expectedEndAt: "2099-10-02T02:30:00.000Z",
      expectedStatus: "requested",
      expectedMemo: 123,
    },
  ]) {
    const runtime = loadRoute();
    const response = await runtime.post(body);

    assert.equal(response.status, 400);
    assert.match(response.body.error, /読み直して/);
    assert.equal(runtime.clientCreated, false);
    assert.equal(runtime.claimCalls.length, 0);
    assert.equal(runtime.lineCalls.length, 0);
  }
});

test("rejects a stale reservation snapshot before claiming or sending", async () => {
  const staleCases = [
    ["expectedCustomerId", "other-customer"],
    ["expectedStaffId", "other-staff"],
    ["expectedMenu", "別メニュー"],
    ["expectedStartAt", "2099-10-02T03:30:00.000Z"],
    ["expectedEndAt", "2099-10-02T04:30:00.000Z"],
    ["expectedStatus", "confirmed"],
    ["expectedMemo", "変更前メモ"],
  ];

  for (const [key, value] of staleCases) {
    const runtime = loadRoute();
    const response = await runtime.post({
      expectedCustomerId: "customer-1",
      expectedStaffId: "staff-1",
      expectedMenu: "ワンカラー",
      expectedStartAt: "2099-10-02T01:30:00.000Z",
      expectedEndAt: "2099-10-02T02:30:00.000Z",
      expectedStatus: "requested",
      expectedMemo: "",
      [key]: value,
    });

    assert.equal(response.status, 409, key);
    assert.match(response.body.error, /最新の内容を読み込み直して/);
    assert.equal(runtime.claimCalls.length, 0, key);
    assert.equal(runtime.lineCalls.length, 0, key);
  }
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

test("maps known alternative-request claim failures without exposing database details", async () => {
  const cases = [
    {
      message: "ALTERNATIVE_REQUEST_INVALID_STAFF",
      status: 403,
      expected: /権限/,
    },
    {
      message: "ALTERNATIVE_REQUEST_SCOPE_MISMATCH",
      status: 403,
      expected: /権限/,
    },
    {
      message: "ALTERNATIVE_REQUEST_INVALID_RESERVATION",
      status: 409,
      expected: /読み込み直して/,
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
    assert.match(response.body.error, claimFailure.expected);
    assert.doesNotMatch(response.body.error, /private|ALTERNATIVE_REQUEST_/);
    assert.equal(runtime.lineCalls.length, 0);
    assert.equal(runtime.completionCalls.length, 0);
  }
});

test("keeps unexpected alternative-request claim failures private", async () => {
  const runtime = loadRoute({
    claimError: { message: "private database function detail" },
  });
  const response = await runtime.post();

  assert.equal(response.status, 500);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.sent, false);
  assert.match(response.body.error, /通知状態を確認/);
  assert.doesNotMatch(response.body.error, /private|database/);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.completionCalls.length, 0);
});

test("does not invite a retry when a network failure cannot be recorded", async () => {
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

test("keeps the retry path when a network failure is successfully recorded", async () => {
  const runtime = loadRoute({ lineResponses: [new Error("LINE timeout")] });
  const response = await runtime.post();
  assert.equal(response.status, 502);
  assert.equal(response.body.status, "failed");
  assert.equal(response.body.retryable, true);
  assert.equal(runtime.lineCalls.length, 1);
  assert.equal(runtime.completionCalls[0].p_attempt_count, 1);
});

test("does not resend after LINE succeeds but the alternative delivery record cannot be saved", async () => {
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

test("staff UI synchronously locks every competing reservation mutation", () => {
  const pageSource = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  for (const functionName of [
    "handleConfirmReservation",
    "retryConfirmationLine",
    "requestAlternativeTime",
    "cancelReservation",
    "handleSubmit",
    "handleDelete",
  ]) {
    const functionStart = pageSource.indexOf(`async function ${functionName}(`);
    assert.notEqual(functionStart, -1, `${functionName} exists`);

    const nextFunction = pageSource.indexOf("\n  async function ", functionStart + 1);
    const functionSource = pageSource.slice(
      functionStart,
      nextFunction === -1 ? undefined : nextFunction
    );

    assert.match(
      functionSource,
      /if \(!reservationId \|\| mutationRequestPendingRef\.current\) return;/
    );
    assert.match(functionSource, /mutationRequestPendingRef\.current = true;/);
    assert.match(
      functionSource,
      /finally \{[\s\S]*mutationRequestPendingRef\.current = false;/
    );
  }
});

test("staff UI sends the displayed reservation snapshot with an alternative-time request", () => {
  const pageSource = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );
  const functionStart = pageSource.indexOf(
    "async function requestAlternativeTime()"
  );
  const nextFunction = pageSource.indexOf(
    "\n  async function ",
    functionStart + 1
  );
  const functionSource = pageSource.slice(functionStart, nextFunction);

  assert.match(functionSource, /headers: \{ "Content-Type": "application\/json" \}/);
  for (const [field, state] of [
    ["expectedCustomerId", "initialCustomerId"],
    ["expectedStaffId", "initialStaffId"],
    ["expectedMenu", "initialMenu"],
    ["expectedStartAt", "initialStartAt"],
    ["expectedEndAt", "initialEndAt"],
    ["expectedStatus", "initialStoredStatus"],
    ["expectedMemo", "initialMemo"],
  ]) {
    assert.match(functionSource, new RegExp(`${field}: ${state}`));
  }
});

test("staff mutation buttons are disabled throughout every pending operation", () => {
  const pageSource = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );
  const sourceFile = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const buttons = [];
  let pendingExpression;
  let disabledExpression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === "isMutating") {
      pendingExpression = node.initializer.getText(sourceFile);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === "mutationControlsDisabled") {
      disabledExpression = node.initializer.getText(sourceFile);
    }
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(sourceFile) === "button") {
      const disabled = node.attributes.properties.find(
        (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === "disabled"
      );
      if (disabled) buttons.push(disabled.initializer.expression.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  assert.equal(buttons.length, 5, "all five write/notification buttons are covered");
  assert.ok(pendingExpression, "pending mutation expression exists");
  assert.ok(disabledExpression, "blocked mutation expression exists");
  for (let mask = 0; mask < 32; mask++) {
    const state = {
      saving: Boolean(mask & 1),
      deleting: Boolean(mask & 2),
      confirming: Boolean(mask & 4),
      requestingAlternative: Boolean(mask & 8),
      mutationResultUnknown: Boolean(mask & 16),
    };
    state.isMutating = vm.runInNewContext(pendingExpression, state);
    state.mutationControlsDisabled = vm.runInNewContext(disabledExpression, state);
    for (const expression of buttons) {
      assert.equal(vm.runInNewContext(expression, state), mask !== 0,
        `${expression}: ${JSON.stringify(state)}`);
    }
  }
});

test("staff UI blocks retries when any reservation mutation result is unknown", () => {
  const pageSource = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    pageSource,
    /const \[mutationResultUnknown, setMutationResultUnknown\] = useState\(false\)/
  );
  assert.match(
    pageSource,
    /if \(!confirmation\) \{[\s\S]{0,180}setMutationResultUnknown\(true\)/
  );
  assert.match(
    pageSource,
    /別日時LINE依頼結果の確認エラー:[\s\S]{0,700}setMutationResultUnknown\(true\)/
  );
  for (const errorLabel of [
    "予約キャンセル結果の確認エラー:",
    "予約更新結果の確認エラー:",
    "予約削除結果の確認エラー:",
  ]) {
    assert.match(
      pageSource,
      new RegExp(`${errorLabel}[\\s\\S]{0,180}setMutationResultUnknown\\(true\\)`)
    );
  }
  assert.match(
    pageSource,
    /予約確定LINE再試行結果の確認エラー:[\s\S]{0,180}const retryLock = getConfirmationLineRetryLock\(null\)[\s\S]{0,260}setConfirmationLineRetryLock\(retryLock\)/
  );
  for (const functionName of ["cancelReservation", "handleSubmit", "handleDelete"]) {
    const functionStart = pageSource.indexOf(`async function ${functionName}(`);
    const nextFunction = pageSource.indexOf("\n  async function ", functionStart + 1);
    const functionSource = pageSource.slice(
      functionStart,
      nextFunction === -1 ? undefined : nextFunction
    );
    assert.match(
      functionSource,
      /if \(!result\) \{[\s\S]{0,180}setMutationResultUnknown\(true\)/,
      `${functionName} blocks after an unparseable response`
    );
  }
  const retryFunctionStart = pageSource.indexOf(
    "async function retryConfirmationLine("
  );
  const retryFunctionEnd = pageSource.indexOf(
    "\n  async function ",
    retryFunctionStart + 1
  );
  const retryFunctionSource = pageSource.slice(
    retryFunctionStart,
    retryFunctionEnd
  );
  assert.match(
    retryFunctionSource,
    /const retryLock = getConfirmationLineRetryLock\(result\)[\s\S]{0,260}setConfirmationLineRetryLock\(retryLock\)[\s\S]{0,80}if \(!result\)/,
    "retryConfirmationLine blocks only the uncertain LINE retry after an unparseable response"
  );
  assert.match(
    pageSource,
    /同じ操作を繰り返さず、最新情報を再読み込みしてください。/
  );
  assert.match(pageSource, /最新情報を再読み込み/);
  assert.match(
    pageSource,
    /setMutationResultUnknown\(false\);[\s\S]{0,120}setPageDataLoaded\(true\)/
  );
});
