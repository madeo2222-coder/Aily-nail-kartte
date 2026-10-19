import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/visits/upcoming-data/route.ts", import.meta.url),
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

function successfulRows() {
  return {
    visits: {
      data: [{
        id: "visit-1",
        customer_id: "customer-1",
        visit_date: "2026-09-20",
        next_visit_date: "2026-09-30",
        next_suggestion: "秋ネイル",
      }],
      error: null,
    },
    customers: {
      data: [{
        id: "customer-1",
        name: "顧客A",
        phone: "090-0000-0000",
      }],
      error: null,
    },
  };
}

function executeRoute({ authentication, rows = successfulRows() }) {
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
        call.filters.push({ method: "eq", column, value });
        return query;
      },
      in(column, values) {
        call.filters.push({ method: "in", column, values });
        return query;
      },
      not(column, operator, value) {
        call.filters.push({ method: "not", column, operator, value });
        return query;
      },
      order(column, options) {
        call.order = { column, options };
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve(rows[table] || { data: [], error: null }).then(
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
    Array,
    Boolean,
    Error,
    Map,
    Object,
    Promise,
    Set,
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

test("upcoming visits API rejects unauthenticated reads before service-role access", async () => {
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

test("upcoming visits API scopes individual staff reads to their salon", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.items[0].customer_name, "顧客A");
  assert.equal(body.items[0].phone, "090-0000-0000");

  for (const table of ["visits", "customers"]) {
    const call = runtime.calls.find((item) => item.table === table);
    assert.ok(call);
    assert.ok(call.filters.some((filter) =>
      filter.method === "eq" &&
      filter.column === "salon_id" &&
      filter.value === SALON_ID
    ));
  }

  const customerCall = runtime.calls.find((item) => item.table === "customers");
  assert.ok(customerCall.filters.some((filter) =>
    filter.method === "in" &&
    filter.column === "id" &&
    filter.values[0] === "customer-1"
  ));
});

test("upcoming visits API keeps signed shared-login reads available", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.exports.GET();

  assert.equal(response.status, 200);
  assert.equal(
    runtime.calls.some((call) =>
      call.filters.some((filter) => filter.column === "salon_id")
    ),
    false,
  );
});

test("upcoming visits API preserves an authoritative empty result", async () => {
  const rows = successfulRows();
  rows.visits = { data: [], error: null };
  const runtime = executeRoute({ authentication: principal(), rows });
  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    ok: true,
    items: [],
  });
  assert.equal(runtime.calls.some((call) => call.table === "customers"), false);
});

for (const table of ["visits", "customers"]) {
  test(`upcoming visits API fails closed after a ${table} read error`, async () => {
    const rows = successfulRows();
    rows[table] = { data: null, error: { message: "read failed" } };
    const runtime = executeRoute({ authentication: principal(), rows });

    const response = await runtime.exports.GET();
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
  });
}
