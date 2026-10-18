import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/customers/list-data/route.ts", import.meta.url),
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
    customers: {
      data: [{ id: "customer-1", name: "顧客A", name_kana: null, allergy: null }],
      error: null,
    },
    visits: {
      data: [{ customer_id: "customer-1", visit_date: "2026-10-01" }],
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
        call.filters.push({ column, value });
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

test("customer list API rejects unauthenticated reads before service-role access", async () => {
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

test("customer list API scopes individual staff reads to their salon", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.customers[0].id, "customer-1");
  for (const table of ["customers", "visits"]) {
    const call = runtime.calls.find((item) => item.table === table);
    assert.ok(call, `${table} was queried`);
    assert.deepEqual(JSON.parse(JSON.stringify(call.filters)), [
      { column: "salon_id", value: SALON_ID },
    ]);
  }
});

test("customer list API keeps signed shared-login reads available", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.exports.GET();

  assert.equal(response.status, 200);
  assert.equal(
    runtime.calls.some((call) => call.filters.length > 0),
    false,
  );
});

for (const table of ["customers", "visits"]) {
  test(`customer list API fails closed after a ${table} read error`, async () => {
    const rows = successfulRows();
    rows[table] = { data: null, error: { message: "read failed" } };
    const runtime = executeRoute({ authentication: principal(), rows });

    const response = await runtime.exports.GET();
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
  });
}
