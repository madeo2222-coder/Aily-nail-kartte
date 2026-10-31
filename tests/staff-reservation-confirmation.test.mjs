// Run: node --test tests/staff-reservation-confirmation.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL("../app/api/reservations/[id]/confirm/route.ts", import.meta.url),
  "utf8"
);
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }

  async json() {
    return this.body;
  }
}

const defaultReservation = {
  id: "reservation-1",
  salon_id: "salon-1",
  customer_id: "customer-1",
  staff_id: "staff-1",
  menu: "ジェル",
  start_at: "2099-10-02T01:30:00.000Z",
  end_at: "2099-10-02T03:00:00.000Z",
  status: "requested",
  source: null,
  memo: "",
};

function editedConfirmationBody(overrides = {}) {
  return {
    customerId: "customer-2",
    staffId: "staff-2",
    menu: "フットジェル",
    startAt: "2099-10-02T04:00:00.000Z",
    endAt: "2099-10-02T05:30:00.000Z",
    memo: "変更後",
    expectedCustomerId: defaultReservation.customer_id,
    expectedStaffId: defaultReservation.staff_id,
    expectedMenu: defaultReservation.menu,
    expectedStartAt: defaultReservation.start_at,
    expectedEndAt: defaultReservation.end_at,
    expectedStatus: defaultReservation.status,
    expectedMemo: defaultReservation.memo,
    ...overrides,
  };
}

function confirmationSnapshotBody(overrides = {}) {
  return {
    expectedCustomerId: defaultReservation.customer_id,
    expectedStaffId: defaultReservation.staff_id,
    expectedMenu: defaultReservation.menu,
    expectedStartAt: defaultReservation.start_at,
    expectedEndAt: defaultReservation.end_at,
    expectedStatus: defaultReservation.status,
    expectedMemo: defaultReservation.memo,
    ...overrides,
  };
}

function createReadQuery(row, calls, error = null) {
  return {
    select(columns) {
      calls.select = columns;
      return this;
    },
    eq(column, value) {
      calls.filters.push([column, value]);
      return this;
    },
    async maybeSingle() {
      return { data: row, error };
    },
  };
}

function loadRoute({
  authenticated = true,
  body = confirmationSnapshotBody(),
  rawBody,
  reservation,
  rpcResult = [{ outcome: "confirmed", reservation_id: "reservation-1" }],
  rpcError = null,
} = {}) {
  const authOptions = [];
  const readCalls = { filters: [], select: "" };
  const rpcCalls = [];
  let clientCreated = false;
  const supabaseAdmin = {
    from(table) {
      assert.equal(table, "reservations");
      return createReadQuery(reservation ?? defaultReservation, readCalls);
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return { data: rpcResult, error: rpcError };
    },
  };
  const exports = {};

  vm.runInNewContext(compiledRoute, {
    exports,
    Date,
    Error,
    Number,
    Object,
    Promise,
    String,
    console: { error() {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      },
    },
    require(name) {
      if (name === "next/server") {
        return {
          NextRequest: class {},
          NextResponse: {
            json(responseBody, options = {}) {
              return new MockResponse(responseBody, options.status ?? 200);
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
      rawBody === undefined
        ? { async json() { return body; } }
        : new Request("https://example.test/api/reservations/reservation-1/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: rawBody,
          }),
      { params: Promise.resolve({ id: "reservation-1" }) }
    );
    return { body: await response.json(), status: response.status };
  }

  return {
    authOptions,
    get clientCreated() {
      return clientCreated;
    },
    post,
    readCalls,
    rpcCalls,
  };
}

test("rejects unauthenticated confirmation before privileged reads", async () => {
  const runtime = loadRoute({ authenticated: false });
  const response = await runtime.post();

  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
  assert.equal(runtime.clientCreated, false);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions[0])), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: false,
    salonContextRequired: true,
  });
});

test("rejects malformed or empty JSON before reading or confirming a reservation", async () => {
  for (const rawBody of ["", '{"startAt":', "not-json"]) {
    const runtime = loadRoute({ rawBody });
    const response = await runtime.post();
    assert.equal(response.status, 400, `invalid body: ${JSON.stringify(rawBody)}`);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.confirmed, false);
    assert.equal(runtime.clientCreated, false);
    assert.equal(runtime.rpcCalls.length, 0);
  }
});

test("rejects an empty JSON confirmation before reading a stale reservation", async () => {
  const runtime = loadRoute({ rawBody: "{}" });
  const response = await runtime.post();
  assert.equal(response.status, 400);
  assert.equal(response.body.confirmed, false);
  assert.match(response.body.error, /予約内容を読み直して/);
  assert.equal(runtime.clientCreated, false);
  assert.equal(runtime.rpcCalls.length, 0);
});

test("scopes the reservation read and atomic confirmation to the staff salon", async () => {
  const runtime = loadRoute({
    body: editedConfirmationBody(),
  });
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.confirmed, true);
  assert.deepEqual(runtime.readCalls.filters, [
    ["id", "reservation-1"],
    ["salon_id", "salon-1"],
  ]);
  assert.equal(runtime.rpcCalls.length, 1);
  assert.match(runtime.readCalls.select, /source/);
  assert.equal(runtime.rpcCalls[0].name, "confirm_staff_reservation");
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.rpcCalls[0].args)),
    {
      p_reservation_id: "reservation-1",
      p_salon_id: "salon-1",
      p_expected_start_at: "2099-10-02T01:30:00.000Z",
      p_expected_end_at: "2099-10-02T03:00:00.000Z",
      p_customer_id: "customer-2",
      p_staff_id: "staff-2",
      p_menu: "フットジェル",
      p_start_at: "2099-10-02T04:00:00.000Z",
      p_end_at: "2099-10-02T05:30:00.000Z",
      p_memo: "変更後",
    }
  );
});

test("does not confirm customer-linked HPB or minimo reservations", async () => {
  for (const reservation of [
    { ...defaultReservation, source: "ＨＯＴ ＰＥＰＰＥＲ" },
    { ...defaultReservation, memo: "ミニモ予約ＩＤ：M-123" },
  ]) {
    const runtime = loadRoute({ reservation });
    const response = await runtime.post();

    assert.equal(response.status, 409);
    assert.equal(response.body.confirmed, false);
    assert.match(response.body.error, /予約元で状態を確認/);
    assert.equal(runtime.rpcCalls.length, 0);
  }
});

test("edited confirmation requires the original reservation snapshot", async () => {
  for (const field of [
    "expectedCustomerId",
    "expectedStaffId",
    "expectedMenu",
    "expectedStartAt",
    "expectedEndAt",
    "expectedStatus",
    "expectedMemo",
  ]) {
    const body = editedConfirmationBody();
    delete body[field];
    const runtime = loadRoute({ body });
    const response = await runtime.post();

    assert.equal(response.status, 400, `${field} is required`);
    assert.equal(runtime.rpcCalls.length, 0);
  }
});

test("list confirmation requires a complete snapshot", async () => {
  for (const field of [
    "expectedCustomerId",
    "expectedStaffId",
    "expectedMenu",
    "expectedStartAt",
    "expectedEndAt",
    "expectedStatus",
    "expectedMemo",
  ]) {
    const body = confirmationSnapshotBody();
    delete body[field];
    const runtime = loadRoute({ body });
    const response = await runtime.post();

    assert.equal(response.status, 400, `${field} is required`);
    assert.equal(runtime.rpcCalls.length, 0);
  }
});

for (const [field, value] of [
  ["customer_id", "customer-synced"],
  ["staff_id", "staff-synced"],
  ["menu", "同期後メニュー"],
  ["start_at", "2099-10-02T02:00:00.000Z"],
  ["end_at", "2099-10-02T03:30:00.000Z"],
  ["status", "confirmed"],
  ["memo", "同期または別端末で更新"],
]) {
  test(`list confirmation rejects a stale ${field} snapshot`, async () => {
    const runtime = loadRoute({
      body: confirmationSnapshotBody(),
      reservation: { ...defaultReservation, [field]: value },
    });
    const response = await runtime.post();

    assert.equal(response.status, 409);
    assert.match(response.body.error, /最新の内容を読み込み直して/);
    assert.equal(runtime.rpcCalls.length, 0);
  });
}

for (const [field, value] of [
  ["customer_id", "customer-synced"],
  ["staff_id", "staff-synced"],
  ["menu", "同期後メニュー"],
  ["start_at", "2099-10-02T02:00:00.000Z"],
  ["end_at", "2099-10-02T03:30:00.000Z"],
  ["status", "confirmed"],
  ["memo", "同期または別端末で更新"],
]) {
  test(`edited confirmation rejects a stale ${field} snapshot`, async () => {
    const runtime = loadRoute({
      body: editedConfirmationBody(),
      reservation: { ...defaultReservation, [field]: value },
    });
    const response = await runtime.post();

    assert.equal(response.status, 409);
    assert.match(response.body.error, /最新の内容を読み込み直して/);
    assert.equal(runtime.rpcCalls.length, 0);
  });
}

test("returns a conflict when the final database check finds an overlap", async () => {
  const runtime = loadRoute({
    rpcResult: [{ outcome: "slot_unavailable", reservation_id: null }],
  });
  const response = await runtime.post();

  assert.equal(response.status, 409);
  assert.equal(response.body.confirmed, false);
  assert.match(response.body.error, /別の予約またはブロック/);
});

test("rejects an elapsed reservation before the confirmation RPC", async () => {
  const runtime = loadRoute({
    body: confirmationSnapshotBody({
      expectedStartAt: "2020-10-02T01:30:00.000Z",
      expectedEndAt: "2020-10-02T03:00:00.000Z",
    }),
    reservation: {
      id: "reservation-1",
      salon_id: "salon-1",
      customer_id: "customer-1",
      staff_id: "staff-1",
      menu: "ジェル",
      start_at: "2020-10-02T01:30:00.000Z",
      end_at: "2020-10-02T03:00:00.000Z",
      status: "requested",
      memo: "",
    },
  });
  const response = await runtime.post();

  assert.equal(response.status, 409);
  assert.equal(response.body.confirmed, false);
  assert.match(response.body.error, /開始時刻を過ぎた予約/);
  assert.equal(runtime.rpcCalls.length, 0);
});

test("does not request another LINE send for an already confirmed reservation", async () => {
  const runtime = loadRoute({
    rpcResult: [
      { outcome: "already_confirmed", reservation_id: "reservation-1" },
    ],
  });
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.confirmed, false);
  assert.equal(response.body.alreadyConfirmed, true);
  assert.match(response.body.message, /LINEは再送していません/);
});

test("staff screens confirm through the guarded API instead of direct Supabase writes", () => {
  const listSource = readFileSync(
    new URL("../app/reservations/ReservationsPageClient.tsx", import.meta.url),
    "utf8"
  );
  const editSource = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    listSource,
    /\/api\/reservations\/\$\{reservation\.id\}\/confirm/
  );
  assert.match(
    editSource,
    /\/api\/reservations\/\$\{reservationId\}\/confirm/
  );
  for (const field of [
    "expectedCustomerId",
    "expectedStaffId",
    "expectedMenu",
    "expectedStartAt",
    "expectedEndAt",
    "expectedStatus",
    "expectedMemo",
  ]) {
    assert.match(editSource, new RegExp(field));
    assert.match(listSource, new RegExp(field));
  }
  assert.doesNotMatch(
    editSource,
    /\.from\("reservations"\)[\s\S]{0,500}\.update\(\{[\s\S]{0,500}status:\s*"confirmed"/
  );
});
