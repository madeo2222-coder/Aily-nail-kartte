import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL(
    "../app/api/customer-reservations/availability/route.ts",
    import.meta.url,
  ),
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
    this.ok = status >= 200 && status < 300;
  }

  async json() {
    return this.body;
  }
}

function loadRoute({ reservation = { id: "reservation-1" }, readError = null } = {}) {
  const filters = [];
  const availabilityCalls = [];
  const query = {
    select(columns) {
      filters.push(["select", columns]);
      return this;
    },
    eq(column, value) {
      filters.push(["eq", column, value]);
      return this;
    },
    async maybeSingle() {
      return { data: reservation, error: readError };
    },
  };
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    console: { error() {} },
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
          requireCustomerLineSession: async () => ({
            id: "customer-1",
            salonId: "salon-1",
          }),
          getSupabaseAdmin: () => ({
            from(table) {
              assert.equal(table, "reservations");
              return query;
            },
          }),
        };
      }
      if (name === "@/lib/server/customerReservationAvailability") {
        return {
          normalizeCustomerBookingDuration: (value) => Number(value),
          isValidCustomerBookingDate: () => true,
          resolveCustomerBookingSalonId: async () => "salon-1",
          getCustomerReservationAvailability: async (options) => {
            availabilityCalls.push(options);
            return { staffs: [], slots: [] };
          },
        };
      }
      return require(name);
    },
  });

  return {
    availabilityCalls,
    filters,
    async post(body) {
      const response = await exports.POST({
        async json() {
          return body;
        },
      });
      return { body: await response.json(), status: response.status };
    },
  };
}

test("editing availability verifies ownership and excludes only that reservation", async () => {
  const runtime = loadRoute();
  const response = await runtime.post({
    date: "2099-10-02",
    durationMinutes: 90,
    reservationId: "reservation-1",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(runtime.filters, [
    ["select", "id"],
    ["eq", "id", "reservation-1"],
    ["eq", "customer_id", "customer-1"],
    ["eq", "salon_id", "salon-1"],
  ]);
  assert.equal(runtime.availabilityCalls.length, 1);
  assert.equal(
    runtime.availabilityCalls[0].excludeReservationId,
    "reservation-1",
  );
});

test("editing availability rejects an unrelated reservation before reading slots", async () => {
  const runtime = loadRoute({ reservation: null });
  const response = await runtime.post({
    date: "2099-10-02",
    durationMinutes: 90,
    reservationId: "other-reservation",
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /予約内容を確認できません/);
  assert.equal(runtime.availabilityCalls.length, 0);
});

test("new reservation availability keeps the existing no-exclusion flow", async () => {
  const runtime = loadRoute();
  const response = await runtime.post({
    date: "2099-10-02",
    durationMinutes: 90,
  });

  assert.equal(response.status, 200);
  assert.equal(runtime.filters.length, 0);
  assert.equal(runtime.availabilityCalls.length, 1);
  assert.equal(runtime.availabilityCalls[0].excludeReservationId, undefined);
});

test("editing availability hides reservation lookup failures", async () => {
  const runtime = loadRoute({ readError: { message: "database detail" } });
  const response = await runtime.post({
    date: "2099-10-02",
    durationMinutes: 90,
    reservationId: "reservation-1",
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, "空き時間の取得に失敗しました");
  assert.doesNotMatch(response.body.error, /database detail/);
  assert.equal(runtime.availabilityCalls.length, 0);
});

test("customer edit form requests owned availability before enabling an update", () => {
  const pageSource = readFileSync(
    new URL(
      "../app/customer-app/reservations/[id]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    pageSource,
    /body: JSON\.stringify\(\{[\s\S]{0,220}date,[\s\S]{0,220}durationMinutes: requestedDuration,[\s\S]{0,220}reservationId/,
  );
  assert.match(pageSource, /availabilitySlots\.map\(\(option\)/);
  assert.match(pageSource, /availableStaffs\.map\(\(staff\)/);
  assert.match(
    pageSource,
    /disabled=\{[\s\S]{0,180}saving[\s\S]{0,180}availabilityLoading[\s\S]{0,180}Boolean\(availabilityError\)[\s\S]{0,180}!time/,
  );
  assert.match(pageSource, /空き時間を再取得/);
});
