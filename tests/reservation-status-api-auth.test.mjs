import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/reservations/[id]/status/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

function executeRoute({
  authentication,
  reservationResult,
  existingVisitResult,
  existingVisitPaymentsResult,
  updateResult,
}) {
  const calls = [];
  let clientCreated = false;

  function makeQuery(table) {
    const call = { table, filters: [] };
    calls.push(call);
    const query = {
      update(value) {
        call.operation = "update";
        call.update = value;
        return query;
      },
      eq(column, value) {
        call.filters.push({ column, value });
        return query;
      },
      is(column, value) {
        call.filters.push({ method: "is", column, value });
        return query;
      },
      select(columns) {
        call.select = columns;
        return query;
      },
      maybeSingle() {
        if (table === "visits") {
          return Promise.resolve(
            existingVisitResult || { data: null, error: null },
          );
        }
        return Promise.resolve(
          call.operation === "update"
            ? updateResult || {
                data: { id: "reservation-1", status: "来店" },
                error: null,
              }
            : reservationResult || {
                data: {
                  id: "reservation-1",
                  customer_id: "customer-1",
                  status: "confirmed",
                },
                error: null,
              },
        );
      },
      limit(value) {
        call.limit = value;
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve(
          table === "visit_payments"
            ? existingVisitPaymentsResult || {
                data: [{ amount: 5000 }],
                error: null,
              }
            : { data: null, error: null },
        ).then(resolve, reject);
      },
    };
    return query;
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Array,
    Error,
    Promise,
    Set,
    String,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      },
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
      if (name === "@/lib/server/staffApiAuthentication") {
        return { authenticateStaffApi: async () => authentication };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            clientCreated = true;
            return { from: makeQuery };
          },
        };
      }
      return require(name);
    },
  });

  return {
    exports,
    calls,
    get clientCreated() {
      return clientCreated;
    },
  };
}

function request(
  status,
  expectedStatus = "confirmed",
  expectedCustomerId = "customer-1",
) {
  return {
    async json() {
      return { status, expectedCustomerId, expectedStatus };
    },
  };
}

const context = { params: Promise.resolve({ id: "reservation-1" }) };

test("reservation status rejects unauthenticated writes before using the service role", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: false,
      status: 401,
      error: "スタッフ認証が必要です。",
    },
  });

  const response = await runtime.exports.POST(request("来店"), context);

  assert.equal(response.status, 401);
  assert.equal(runtime.clientCreated, false);
  assert.equal(runtime.calls.length, 0);
});

test("reservation status limits values and scopes individual staff writes", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "supabase",
        staffId: "staff-1",
        salonId: "salon-1",
        role: "staff",
        isActive: true,
      },
    },
  });

  const invalidResponse = await runtime.exports.POST(
    request("キャンセル"),
    context,
  );
  assert.equal(invalidResponse.status, 400);
  assert.equal(runtime.clientCreated, false);

  const response = await runtime.exports.POST(request("来店"), context);
  const body = await response.json();
  const read = runtime.calls.find(
    (item) => item.table === "reservations" && !item.operation,
  );
  const call = runtime.calls.find((item) => item.operation === "update");

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(call.update)), { status: "来店" });
  assert.deepEqual(JSON.parse(JSON.stringify(call.filters)), [
    { column: "id", value: "reservation-1" },
    { column: "salon_id", value: "salon-1" },
    { column: "status", value: "confirmed" },
    { column: "customer_id", value: "customer-1" },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(read.filters)), [
    { column: "id", value: "reservation-1" },
    { column: "salon_id", value: "salon-1" },
  ]);
});

test("reservation status keeps the signed shared-login update path available", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
  });

  const response = await runtime.exports.POST(request("来店"), context);
  const call = runtime.calls.find((item) => item.operation === "update");

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(call.filters)), [
    { column: "id", value: "reservation-1" },
    { column: "status", value: "confirmed" },
    { column: "customer_id", value: "customer-1" },
  ]);
});

test("reservation status requires the displayed status snapshot", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
  });

  const response = await runtime.exports.POST(
    {
      async json() {
        return { status: "来店", expectedCustomerId: "customer-1" };
      },
    },
    context,
  );

  assert.equal(response.status, 400);
  assert.equal(runtime.clientCreated, false);
});

test("reservation status refuses a different customer before writing", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
  });

  const response = await runtime.exports.POST(
    request("来店", "confirmed", "other-customer"),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /最新の内容を読み込み直して/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("reservation status refuses a stale list after sync changed the status", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    reservationResult: {
      data: {
        id: "reservation-1",
        customer_id: "customer-1",
        status: "キャンセル",
      },
      error: null,
    },
  });

  const response = await runtime.exports.POST(request("来店"), context);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /最新の内容を読み込み直して/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("reservation status refuses another visit when the reservation is already linked", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    existingVisitResult: {
      data: { id: "visit-1" },
      error: null,
    },
  });

  const response = await runtime.exports.POST(request("来店"), context);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, "この予約には既に来店履歴があります。");
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("reservation status rejects invalid direct transitions before writing", async () => {
  const cases = [
    { current: "confirmed", next: "完了" },
    { current: "キャンセル", next: "来店" },
    { current: "完了", next: "来店" },
    { current: "予約", next: "完了" },
  ];

  for (const { current, next } of cases) {
    const runtime = executeRoute({
      authentication: {
        ok: true,
        principal: {
          authenticationMode: "legacy",
          staffId: null,
          salonId: null,
          role: "staff",
          isActive: null,
        },
      },
      reservationResult: {
        data: {
          id: "reservation-1",
          customer_id: "customer-1",
          status: current,
        },
        error: null,
      },
    });

    const response = await runtime.exports.POST(
      request(next, current),
      context,
    );
    const body = await response.json();

    assert.equal(response.status, 409, `${current} -> ${next}`);
    assert.match(body.error, /現在の予約状態からは更新できません/);
    assert.equal(
      runtime.calls.some((call) => call.operation === "update"),
      false,
      `${current} -> ${next}`,
    );
  }
});

test("reservation status preserves the supported visit and completion transitions", async () => {
  const cases = [
    { current: "pending", next: "来店" },
    { current: "requested", next: "来店" },
    { current: "予約申請中", next: "来店" },
    { current: "予約受付", next: "来店" },
    { current: "予約", next: "来店" },
    { current: "予約確定", next: "来店" },
    { current: "confirmed", next: "来店" },
    { current: "ＣＯＮＦＩＲＭＥＤ", next: "来店" },
    { current: "予 約 確 定", next: "来店" },
    { current: "来店予定", next: "来店" },
    { current: "来店", next: "来店" },
    { current: "来 店", next: "来店" },
    { current: "完了待ち", next: "来店" },
    { current: "来店予定", next: "完了" },
    { current: "来店", next: "完了" },
    { current: "来 店", next: "完了" },
    { current: "完了待ち", next: "完了" },
  ];

  for (const { current, next } of cases) {
    const runtime = executeRoute({
      authentication: {
        ok: true,
        principal: {
          authenticationMode: "legacy",
          staffId: null,
          salonId: null,
          role: "staff",
          isActive: null,
        },
      },
      reservationResult: {
        data: {
          id: "reservation-1",
          customer_id: "customer-1",
          status: current,
        },
        error: null,
      },
      updateResult: {
        data: { id: "reservation-1", status: next },
        error: null,
      },
    });

    const response = await runtime.exports.POST(
      request(next, current),
      context,
    );
    const body = await response.json();

    assert.equal(response.status, 200, `${current} -> ${next}`);
    assert.equal(body.ok, true);
  }
});

test("reservation status reports a write-time status race as a conflict", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    updateResult: { data: null, error: null },
  });

  const response = await runtime.exports.POST(request("来店"), context);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /最新の内容を読み込み直して/);
});

test("reservation status resumes an interrupted visit transition without rewriting it", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    reservationResult: {
      data: {
        id: "reservation-1",
        customer_id: "customer-1",
        status: "来店",
      },
      error: null,
    },
  });

  const response = await runtime.exports.POST(
    request("来店", "confirmed"),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    ok: true,
    reservation: { id: "reservation-1", status: "来店" },
  });
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("reservation status resumes an interrupted completion without rewriting it", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    reservationResult: {
      data: {
        id: "reservation-1",
        customer_id: "customer-1",
        status: "完了",
      },
      error: null,
    },
  });

  const response = await runtime.exports.POST(
    request("完了", "来店"),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    ok: true,
    reservation: { id: "reservation-1", status: "完了" },
  });
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("reservation status does not treat an invalid direct completion as a replay", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    reservationResult: {
      data: {
        id: "reservation-1",
        customer_id: "customer-1",
        status: "完了",
      },
      error: null,
    },
  });

  const response = await runtime.exports.POST(
    request("完了", "confirmed"),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /最新の内容を読み込み直して/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("reservation status does not resume when the interrupted visit already exists", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    reservationResult: {
      data: {
        id: "reservation-1",
        customer_id: "customer-1",
        status: "来店",
      },
      error: null,
    },
    existingVisitResult: {
      data: { id: "visit-1" },
      error: null,
    },
  });
  const response = await runtime.exports.POST(
    request("来店", "confirmed"),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, "この予約には既に来店履歴があります。");
});

test("reservation status resumes completion only for a fully paid linked visit", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    reservationResult: {
      data: {
        id: "reservation-1",
        customer_id: "customer-1",
        status: "来店",
      },
      error: null,
    },
    existingVisitResult: {
      data: {
        id: "visit-1",
        customer_id: "customer-1",
        price: 5000,
        payment_status: "paid",
        paid_amount: 5000,
        unpaid_amount: 0,
      },
      error: null,
    },
    existingVisitPaymentsResult: {
      data: [{ amount: 3000 }, { amount: "2000" }],
      error: null,
    },
  });

  const response = await runtime.exports.POST(
    request("来店", "来店"),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    ok: true,
    reservation: { id: "reservation-1", status: "来店" },
    existingVisit: { id: "visit-1" },
  });
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("reservation status refuses completion recovery for incomplete payments", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    reservationResult: {
      data: {
        id: "reservation-1",
        customer_id: "customer-1",
        status: "来店",
      },
      error: null,
    },
    existingVisitResult: {
      data: {
        id: "visit-1",
        customer_id: "customer-1",
        price: 5000,
        payment_status: "paid",
        paid_amount: 5000,
        unpaid_amount: 0,
      },
      error: null,
    },
    existingVisitPaymentsResult: {
      data: [{ amount: 3000 }],
      error: null,
    },
  });

  const response = await runtime.exports.POST(
    request("来店", "来店"),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, "この予約には既に来店履歴があります。");
});

test("reservation status refuses completion recovery for an unpaid visit", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "legacy",
        staffId: null,
        salonId: null,
        role: "staff",
        isActive: null,
      },
    },
    reservationResult: {
      data: {
        id: "reservation-1",
        customer_id: "customer-1",
        status: "来店",
      },
      error: null,
    },
    existingVisitResult: {
      data: {
        id: "visit-1",
        customer_id: "customer-1",
        price: 5000,
        payment_status: "pending",
        paid_amount: 3000,
        unpaid_amount: 2000,
      },
      error: null,
    },
    existingVisitPaymentsResult: {
      data: [{ amount: 5000 }],
      error: null,
    },
  });

  const response = await runtime.exports.POST(
    request("来店", "来店"),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, "この予約には既に来店履歴があります。");
});

test("reservation status preserves not-found and rejects an unset current status", async () => {
  const authentication = {
    ok: true,
    principal: {
      authenticationMode: "legacy",
      staffId: null,
      salonId: null,
      role: "staff",
      isActive: null,
    },
  };
  const missingRuntime = executeRoute({
    authentication,
    reservationResult: { data: null, error: null },
  });
  const missingResponse = await missingRuntime.exports.POST(
    request("来店"),
    context,
  );
  assert.equal(missingResponse.status, 404);

  const nullRuntime = executeRoute({
    authentication,
    reservationResult: {
      data: {
        id: "reservation-1",
        customer_id: "customer-1",
        status: null,
      },
      error: null,
    },
  });
  const nullResponse = await nullRuntime.exports.POST(
    request("来店", null),
    context,
  );
  const nullBody = await nullResponse.json();

  assert.equal(nullResponse.status, 409);
  assert.match(nullBody.error, /現在の予約状態からは更新できません/);
  const update = nullRuntime.calls.find((call) => call.operation === "update");
  assert.equal(update, undefined);
});
