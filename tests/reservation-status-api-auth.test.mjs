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

function executeRoute({ authentication, reservationResult, updateResult }) {
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
        return Promise.resolve(
          call.operation === "update"
            ? updateResult || {
                data: { id: "reservation-1", status: "来店" },
                error: null,
              }
            : reservationResult || {
                data: { id: "reservation-1", status: "confirmed" },
                error: null,
              },
        );
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

function request(status, expectedStatus = "confirmed") {
  return { async json() { return { status, expectedStatus }; } };
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
  const read = runtime.calls[0];
  const call = runtime.calls[1];

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(call.update)), { status: "来店" });
  assert.deepEqual(JSON.parse(JSON.stringify(call.filters)), [
    { column: "id", value: "reservation-1" },
    { column: "salon_id", value: "salon-1" },
    { column: "status", value: "confirmed" },
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

  const response = await runtime.exports.POST(request("完了"), context);
  const call = runtime.calls[1];

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(call.filters)), [
    { column: "id", value: "reservation-1" },
    { column: "status", value: "confirmed" },
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
    { async json() { return { status: "来店" }; } },
    context,
  );

  assert.equal(response.status, 400);
  assert.equal(runtime.clientCreated, false);
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
      data: { id: "reservation-1", status: "キャンセル" },
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

test("reservation status preserves not-found and null status semantics", async () => {
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
      data: { id: "reservation-1", status: null },
      error: null,
    },
  });
  const nullResponse = await nullRuntime.exports.POST(
    request("来店", null),
    context,
  );
  assert.equal(nullResponse.status, 200);
  const update = nullRuntime.calls.find((call) => call.operation === "update");
  assert.ok(
    update.filters.some(
      (filter) =>
        filter.method === "is" &&
        filter.column === "status" &&
        filter.value === null,
    ),
  );
});
