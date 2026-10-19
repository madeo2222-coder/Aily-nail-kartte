import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/visits/registration-data/route.ts", import.meta.url),
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
  authentication,
  customerResult = {
    data: [
      {
        id: "customer-1",
        name: "顧客A",
        phone: "090-0000-0000",
        salon_id: SALON_ID,
      },
    ],
    error: null,
  },
  staffResult = {
    data: [
      {
        id: "staff-1",
        name: "担当A",
        salon_id: SALON_ID,
      },
    ],
    error: null,
  },
}) {
  const calls = [];
  let authOptions = null;
  let clientCreated = false;

  function makeQuery(table) {
    const call = { table, filters: [], selects: [] };
    calls.push(call);
    const query = {
      select(columns) {
        call.selects.push(columns);
        return query;
      },
      eq(column, value) {
        call.filters.push({ column, value });
        return query;
      },
      order(column, options) {
        call.order = { column, options };
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve(
          table === "staffs" ? staffResult : customerResult,
        ).then(resolve, reject);
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
    get authOptions() {
      return authOptions;
    },
    get clientCreated() {
      return clientCreated;
    },
  };
}

test("registration data API rejects unauthenticated reads before service-role access", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: false,
      status: 401,
      error: "スタッフ認証が必要です。",
    },
  });

  const response = await runtime.exports.GET();

  assert.equal(response.status, 401);
  assert.equal(runtime.clientCreated, false);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions)), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
});

test("registration data API scopes individual staff reads to their salon", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.authenticationMode, "supabase");
  assert.equal(body.customers[0].id, "customer-1");
  assert.equal(body.staffs[0].id, "staff-1");
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[0].filters)), [
    { column: "salon_id", value: SALON_ID },
  ]);
  assert.deepEqual(runtime.calls[0].selects, ["id, name, phone, salon_id"]);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[1].filters)), [
    { column: "salon_id", value: SALON_ID },
    { column: "role", value: "staff" },
    { column: "is_active", value: true },
  ]);
  assert.deepEqual(runtime.calls[1].selects, ["id, name, salon_id"]);
});

test("registration data API keeps signed shared-login reads available", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.authenticationMode, "legacy");
  assert.deepEqual(JSON.parse(JSON.stringify(body.staffs)), []);
  assert.deepEqual(runtime.calls[0].filters, []);
  assert.equal(runtime.calls.length, 1);
});

test("registration data API fails closed after a customer read error", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    customerResult: { data: null, error: { message: "read failed" } },
  });

  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.ok, false);
});

test("registration data API fails closed after a staff read error", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    staffResult: { data: null, error: { message: "read failed" } },
  });

  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.ok, false);
});
