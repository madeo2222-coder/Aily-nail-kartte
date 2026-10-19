import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/visits/[id]/edit-data/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const VISIT_ID = "40000000-0000-4000-8000-000000000004";
const CUSTOMER_ID = "10000000-0000-4000-8000-000000000001";
const SALON_ID = "30000000-0000-4000-8000-000000000003";

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
  visitResult = {
    data: [
      {
        id: VISIT_ID,
        customer_id: CUSTOMER_ID,
        salon_id: SALON_ID,
        visit_date: "2026-09-29",
        menu: "ワンカラー",
        menu_name: null,
        color: "ベージュ",
        memo: null,
        price: 6500,
        payment_method: "現金",
        created_at: "2026-09-29T00:00:00Z",
      },
    ],
    error: null,
  },
  customerResult = {
    data: [{ id: CUSTOMER_ID, name: "顧客A", salon_id: SALON_ID }],
    error: null,
  },
  photoResult = { data: [], error: null },
  paymentResult = {
    data: [
      {
        id: "50000000-0000-4000-8000-000000000005",
        visit_id: VISIT_ID,
        payment_method: "現金",
        amount: 6500,
        sort_order: 1,
      },
    ],
    error: null,
  },
} = {}) {
  const calls = [];
  let clientCreated = false;
  let authOptions = null;

  function resultFor(table) {
    if (table === "visits") return visitResult;
    if (table === "customers") return customerResult;
    if (table === "visit_photos") return photoResult;
    return paymentResult;
  }

  function from(table) {
    const call = { table, filters: [] };
    calls.push(call);
    const query = {
      select(columns) { call.select = columns; return query; },
      eq(column, value) { call.filters.push({ column, value }); return query; },
      limit(value) { call.limit = value; return Promise.resolve(resultFor(table)); },
      order(column, options) {
        call.order = { column, options };
        return Promise.resolve(resultFor(table));
      },
    };
    return query;
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Request,
    Promise,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      },
    },
    require(name) {
      if (name === "server-only") return {};
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
          authenticateStaffApi: async options => {
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

  async function get(id = VISIT_ID) {
    return exports.GET(new Request(`https://app.example/api/visits/${id}/edit-data`), {
      params: Promise.resolve({ id }),
    });
  }

  return {
    calls,
    get,
    get authOptions() { return authOptions; },
    get clientCreated() { return clientCreated; },
  };
}

test("visit edit API rejects unauthenticated reads before service-role access", async () => {
  const runtime = executeRoute({
    authentication: { ok: false, status: 401, error: "スタッフ認証が必要です。" },
  });
  const response = await runtime.get();

  assert.equal(response.status, 401);
  assert.equal(runtime.clientCreated, false);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions)), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
});

test("visit edit API scopes the visit and customer to the individual staff salon", async () => {
  const runtime = executeRoute();
  const response = await runtime.get();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.visit.id, VISIT_ID);
  assert.equal(body.customer.id, CUSTOMER_ID);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[0].filters)), [
    { column: "id", value: VISIT_ID },
    { column: "salon_id", value: SALON_ID },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[1].filters)), [
    { column: "id", value: CUSTOMER_ID },
    { column: "salon_id", value: SALON_ID },
  ]);
});

test("visit edit API keeps signed shared-login reads available", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.get();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[0].filters)), [
    { column: "id", value: VISIT_ID },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[1].filters)), [
    { column: "id", value: CUSTOMER_ID },
  ]);
});

test("visit edit API returns not found when the scoped visit is unavailable", async () => {
  const runtime = executeRoute({ visitResult: { data: [], error: null } });
  const response = await runtime.get();

  assert.equal(response.status, 404);
  assert.equal(runtime.calls.length, 1);
});

test("visit edit API fails closed when dependent data is incomplete", async () => {
  const runtime = executeRoute({
    customerResult: { data: [], error: null },
  });
  const response = await runtime.get();

  assert.equal(response.status, 500);
  assert.equal(runtime.calls.length, 4);
});

test("visit edit API rejects malformed visit IDs before authentication", async () => {
  const runtime = executeRoute();
  const response = await runtime.get("not-a-visit-id");

  assert.equal(response.status, 400);
  assert.equal(runtime.clientCreated, false);
  assert.equal(runtime.authOptions, null);
});
