import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/reservations/list-data/route.ts", import.meta.url),
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

function executeRoute({ authentication, rows = {} }) {
  const calls = [];
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
    Error,
    Object,
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

test("reservation list rejects unauthenticated reads before using the service role", async () => {
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
});

test("reservation list scopes individual staff reads and returns only related customers", async () => {
  const salonId = "salon-1";
  const runtime = executeRoute({
    authentication: {
      ok: true,
      principal: {
        authenticationMode: "supabase",
        staffId: "staff-1",
        salonId,
        role: "staff",
        isActive: true,
      },
    },
    rows: {
      reservations: {
        data: [
          {
            id: "reservation-1",
            customer_id: "customer-1",
            staff_id: "staff-1",
            status: "confirmed",
            private_internal: "must-not-leave-server",
          },
        ],
        error: null,
      },
      staffs: { data: [{ id: "staff-1", name: "担当A" }], error: null },
      customers: {
        data: [{ id: "customer-1", name: "顧客A" }],
        error: null,
      },
    },
  });

  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.reservations[0].private_internal, undefined);

  for (const table of ["reservations", "staffs"]) {
    const call = runtime.calls.find((item) => item.table === table);
    assert.ok(
      call.filters.some(
        (filter) =>
          filter.method === "eq" &&
          filter.column === "salon_id" &&
          filter.value === salonId,
      ),
      `${table} is scoped to the authenticated salon`,
    );
  }

  const customerCall = runtime.calls.find((item) => item.table === "customers");
  assert.deepEqual(
    JSON.parse(JSON.stringify(customerCall.filters)),
    [{ method: "in", column: "id", values: ["customer-1"] }],
  );
});

test("reservation list keeps the signed shared-login read path available", async () => {
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

  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(
    runtime.calls.some((call) =>
      call.filters.some((filter) => filter.column === "salon_id"),
    ),
    false,
  );
});
