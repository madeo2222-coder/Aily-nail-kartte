import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/reservations/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }
}

function query(result, calls) {
  const filters = [];
  const builder = {
    select() {
      return builder;
    },
    eq(column, value) {
      filters.push({ column, value });
      return builder;
    },
    limit() {
      return builder;
    },
    async maybeSingle() {
      calls.push(filters);
      return result;
    },
  };
  return builder;
}

function loadRoute({
  customer = { id: "customer-1", salonId: "salon-1" },
  results = [],
} = {}) {
  let adminClientCreated = false;
  let resultIndex = 0;
  const calls = [];
  const supabase = {
    from(table) {
      assert.equal(table, "reservations");
      const result = results[resultIndex++] || { data: null, error: null };
      return query(result, calls);
    },
  };
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    Date,
    Error,
    Intl,
    Map,
    Number,
    Promise,
    RegExp,
    String,
    URL,
    console: { error() {}, log() {} },
    process: { env: {} },
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
      if (name === "@/lib/server/requireCustomerLineSession") {
        return {
          requireCustomerLineSession: async () => customer,
          getSupabaseAdmin() {
            adminClientCreated = true;
            return supabase;
          },
        };
      }
      if (name === "@/lib/server/customerReservationAvailability") {
        return {
          getCustomerReservationAvailability: async () => ({
            slots: [],
            staffs: [],
          }),
          isValidCustomerBookingDate: () => true,
          normalizeCustomerBookingDuration(value) {
            const minutes = Number(value);
            return Number.isInteger(minutes) && minutes >= 30 && minutes <= 360
              ? minutes
              : null;
          },
          resolveCustomerBookingSalonId: async () => "salon-1",
        };
      }
      if (name === "@/lib/customer-reservation-submission") {
        return {
          isCustomerReservationOperationId: value => value === OPERATION_ID,
        };
      }
      return require(name);
    },
  });

  const params = new URLSearchParams({
    operationId: OPERATION_ID,
    menu: "ワンカラー",
    date: "2026-11-03",
    time: "10:00",
    staffId: "staff-1",
    durationMinutes: "90",
  });

  return {
    calls,
    get adminClientCreated() {
      return adminClientCreated;
    },
    get: () =>
      exports.GET({ nextUrl: { searchParams: params } }),
  };
}

test("customer reservation reconciliation rejects unsigned access before service-role use", async () => {
  const route = loadRoute({ customer: null });
  const response = await route.get();

  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
  assert.equal(route.adminClientCreated, false);
});

test("customer reservation reconciliation confirms the operation-scoped row", async () => {
  const route = loadRoute({
    results: [{ data: { id: OPERATION_ID }, error: null }],
  });
  const response = await route.get();

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "saved");
  assert.deepEqual(
    JSON.parse(JSON.stringify(route.calls[0])),
    [
      { column: "id", value: OPERATION_ID },
      { column: "customer_id", value: "customer-1" },
      { column: "salon_id", value: "salon-1" },
    ],
  );
});

test("customer reservation reconciliation finds an exact legacy reservation", async () => {
  const route = loadRoute({
    results: [
      { data: null, error: null },
      { data: { id: "legacy-reservation" }, error: null },
    ],
  });
  const response = await route.get();

  assert.equal(response.body.status, "saved");
  assert.ok(
    route.calls[1].some(
      filter => filter.column === "customer_id" && filter.value === "customer-1",
    ),
  );
  assert.ok(
    route.calls[1].some(
      filter => filter.column === "staff_id" && filter.value === "staff-1",
    ),
  );
  assert.ok(
    route.calls[1].some(
      filter => filter.column === "start_at" && filter.value === "2026-11-03T01:00:00.000Z",
    ),
  );
});

test("customer reservation reconciliation stays locked after a clean miss or read error", async () => {
  for (const results of [
    [
      { data: null, error: null },
      { data: null, error: null },
    ],
    [{ data: null, error: { message: "temporary read failure" } }],
  ]) {
    const response = await loadRoute({ results }).get();
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "unknown");
  }
});

