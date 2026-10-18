import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/customers/staff-create/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const SALON_ID = "e120ed90-fded-41b8-b3fe-f486e84f2418";

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

function principal(authenticationMode = "supabase") {
  return authenticationMode === "supabase"
    ? {
        ok: true,
        principal: {
          authenticationMode: "supabase",
          staffId: "staff-1",
          salonId: SALON_ID,
          role: "staff",
          isActive: true,
        },
      }
    : {
        ok: true,
        principal: {
          authenticationMode: "legacy",
          staffId: null,
          salonId: null,
          role: "staff",
          isActive: null,
        },
      };
}

function executeRoute({
  authentication = principal(),
  customers = [],
  customerError = null,
  insertData = { id: "new-customer" },
  insertError = null,
} = {}) {
  const calls = [];
  let authOptions = null;
  let clientCreated = false;

  function from(table) {
    const call = { table, filters: [], operation: "read", payload: null };
    calls.push(call);
    const query = {
      select(columns) {
        call.select = columns;
        return query;
      },
      not(column, operator, value) {
        call.filters.push({ method: "not", column, operator, value });
        return query;
      },
      eq(column, value) {
        call.filters.push({ method: "eq", column, value });
        return query;
      },
      insert(payload) {
        call.operation = "insert";
        call.payload = payload;
        return query;
      },
      async single() {
        return { data: insertData, error: insertError };
      },
      then(resolve, reject) {
        return Promise.resolve({ data: customers, error: customerError }).then(
          resolve,
          reject,
        );
      },
    };
    return query;
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    Promise,
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
        return {
          authenticateStaffApi: async (options) => {
            authOptions = options;
            return authentication;
          },
        };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            clientCreated = true;
            return { from };
          },
        };
      }
      return require(name);
    },
  });

  return {
    exports,
    calls,
    get authOptions() {
      return authOptions;
    },
    get clientCreated() {
      return clientCreated;
    },
  };
}

function request(body) {
  return { json: async () => body };
}

test("customer create rejects unauthenticated writes before service-role access", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: false,
      status: 401,
      error: "スタッフ認証が必要です。",
    },
  });

  const response = await runtime.exports.POST(request({ name: "顧客A" }));

  assert.equal(response.status, 401);
  assert.equal(runtime.clientCreated, false);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions)), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
});

test("individual staff duplicate checks and inserts are scoped to their salon", async () => {
  const runtime = executeRoute();
  const response = await runtime.exports.POST(
    request({ name: " 山田 花子 ", phone: "090-1234-5678" }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    ok: true,
    id: "new-customer",
    existing: false,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[0].filters)), [
    { method: "not", column: "name", operator: "is", value: null },
    { method: "eq", column: "salon_id", value: SALON_ID },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[1].payload)), [
    { name: "山田 花子", phone: "090-1234-5678", salon_id: SALON_ID },
  ]);
});

test("signed shared login preserves the existing unscoped registration flow", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.exports.POST(
    request({ name: "共有 顧客", phone: "" }),
  );

  assert.equal(response.status, 200);
  assert.equal(
    runtime.calls[0].filters.some((filter) => filter.column === "salon_id"),
    false,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[1].payload)), [
    { name: "共有 顧客", phone: null },
  ]);
});

for (const match of [
  { name: "別名", phone: "090 1234 5678" },
  { name: "山田　花子", phone: "" },
]) {
  test(`duplicate customer ${match.phone ? "phone" : "name"} reopens without inserting`, async () => {
    const runtime = executeRoute({
      customers: [{ id: "existing-customer", ...match }],
    });
    const response = await runtime.exports.POST(
      request({ name: "山田 花子", phone: "090-1234-5678" }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.existing, true);
    assert.equal(body.id, "existing-customer");
    assert.equal(runtime.calls.length, 1);
  });
}

test("customer create validates input before opening a service-role client", async () => {
  const runtime = executeRoute();
  const response = await runtime.exports.POST(request({ name: "　 ", phone: "" }));

  assert.equal(response.status, 400);
  assert.equal(runtime.clientCreated, false);
});

for (const failure of ["read", "insert", "missing-id"]) {
  test(`customer create fails closed after ${failure} failure`, async () => {
    const runtime = executeRoute({
      customerError: failure === "read" ? { message: "read failed" } : null,
      insertError: failure === "insert" ? { message: "insert failed" } : null,
      insertData: failure === "missing-id" ? null : { id: "new-customer" },
    });
    const response = await runtime.exports.POST(
      request({ name: "顧客A", phone: "" }),
    );
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
  });
}
