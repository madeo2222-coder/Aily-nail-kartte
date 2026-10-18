import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/external-calendar-tasks/route.ts", import.meta.url),
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

function executeRoute({ authentication, rows = {} }) {
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
      order(column, options) {
        call.order = { column, options };
        return query;
      },
      eq(column, value) {
        call.filters.push({ method: "eq", column, value });
        return query;
      },
      gte(column, value) {
        call.filters.push({ method: "gte", column, value });
        return query;
      },
      in(column, values) {
        call.filters.push({ method: "in", column, values });
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
    Date,
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

test("external task API rejects unauthenticated reads before service-role access", async () => {
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
  assert.equal(runtime.calls.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions)), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
});

test("external task API scopes individual staff reads and limits customer lookup", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      reservations: {
        data: [
          { id: "reservation-1", customer_id: "customer-1" },
          { id: "reservation-2", customer_id: "customer-1" },
        ],
        error: null,
      },
      staffs: { data: [{ id: "staff-1", name: "担当A" }], error: null },
      customers: { data: [{ id: "customer-1", name: "顧客A" }], error: null },
    },
  });

  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  for (const table of ["reservations", "staffs"]) {
    const call = runtime.calls.find((item) => item.table === table);
    assert.ok(
      call.filters.some(
        (filter) =>
          filter.method === "eq" &&
          filter.column === "salon_id" &&
          filter.value === SALON_ID,
      ),
      `${table} is scoped to the authenticated salon`,
    );
  }

  const reservationsCall = runtime.calls.find(
    (item) => item.table === "reservations",
  );
  assert.ok(
    reservationsCall.filters.some(
      (filter) =>
        filter.method === "gte" &&
        filter.column === "start_at" &&
        typeof filter.value === "string",
    ),
    "past reservations are not returned to the browser",
  );

  const customersCall = runtime.calls.find((item) => item.table === "customers");
  assert.deepEqual(
    JSON.parse(JSON.stringify(customersCall.filters)),
    [{ method: "in", column: "id", values: ["customer-1"] }],
  );
});

test("external task API keeps signed shared-login reads available", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.exports.GET();

  assert.equal(response.status, 200);
  assert.equal(
    runtime.calls.some((call) =>
      call.filters.some((filter) => filter.column === "salon_id"),
    ),
    false,
  );
});

test("external task API skips customer reads when no reservation references one", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      reservations: {
        data: [{ id: "reservation-1", customer_id: null }],
        error: null,
      },
    },
  });

  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(body.customers)), []);
  assert.equal(runtime.calls.some((call) => call.table === "customers"), false);
});

for (const table of ["reservations", "staffs", "customers"]) {
  test(`external task API fails closed after a ${table} read error`, async () => {
    const rows = {
      reservations: {
        data: [{ id: "reservation-1", customer_id: "customer-1" }],
        error: null,
      },
      staffs: { data: [], error: null },
      customers: { data: [], error: null },
    };
    rows[table] = { data: null, error: { message: "read failed" } };
    const runtime = executeRoute({ authentication: principal(), rows });

    const response = await runtime.exports.GET();
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
  });
}
