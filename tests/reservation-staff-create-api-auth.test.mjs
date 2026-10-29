import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/reservations/staff-create/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const staffReservationSubmission = (() => {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(
      new URL("../lib/staff-reservation-submission.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(source, { exports, JSON, RegExp });
  return exports;
})();

const SALON_ID = "e120ed90-fded-41b8-b3fe-f486e84f2418";
const OTHER_SALON_ID = "954e4418-4606-4932-8f03-87dfbe962967";
const STAFF_ID = "e568f9c8-3c8f-4f6b-9aa4-e9ded5e126e9";
const CUSTOMER_ID = "d9dfb5b6-f8c8-4e83-8c5c-ce241b7212c9";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";

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
  let authOptions = null;
  let clientCreated = false;
  let reservationSingleCount = 0;

  function resultFor(call, terminal) {
    if (call.operation === "insert") {
      return rows.insert || { data: { id: "reservation-new" }, error: null };
    }
    if (terminal === "maybeSingle") {
      if (call.table === "staffs") {
        return (
          rows.staffSingle || {
            data: {
              id: STAFF_ID,
              salon_id: SALON_ID,
              role: "staff",
              is_active: true,
            },
            error: null,
          }
        );
      }
      if (call.table === "customers") {
        return (
          rows.customerSingle || {
            data: { id: CUSTOMER_ID, salon_id: SALON_ID },
            error: null,
          }
        );
      }
      if (call.table === "reservations") {
        const result = rows.operationSingles?.[reservationSingleCount]
          ?? rows.operationSingle
          ?? { data: null, error: null };
        reservationSingleCount += 1;
        return result;
      }
    }
    return rows[call.table] || { data: [], error: null };
  }

  function makeQuery(table) {
    const call = {
      table,
      operation: "read",
      filters: [],
      selects: [],
    };
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
      or(value) {
        call.filters.push({ method: "or", value });
        return query;
      },
      lt(column, value) {
        call.filters.push({ method: "lt", column, value });
        return query;
      },
      gt(column, value) {
        call.filters.push({ method: "gt", column, value });
        return query;
      },
      insert(value) {
        call.operation = "insert";
        call.insert = value;
        return query;
      },
      maybeSingle() {
        return Promise.resolve(resultFor(call, "maybeSingle"));
      },
      single() {
        return Promise.resolve(resultFor(call, "single"));
      },
      then(resolve, reject) {
        return Promise.resolve(resultFor(call, "then")).then(resolve, reject);
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
    Number,
    Promise,
    RegExp,
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
      if (name === "@/lib/staff-reservation-submission") {
        return staffReservationSubmission;
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

function principal(authenticationMode = "supabase") {
  return authenticationMode === "supabase"
    ? {
        ok: true,
        principal: {
          authenticationMode: "supabase",
          staffId: STAFF_ID,
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

function postRequest(overrides = {}) {
  return {
    async json() {
      return {
        mode: "normal",
        salonId: SALON_ID,
        customerId: CUSTOMER_ID,
        staffId: STAFF_ID,
        menu: "ワンカラー",
        startAt: "2099-10-19T01:00:00.000Z",
        endAt: "2099-10-19T02:30:00.000Z",
        status: "予約",
        memo: "確認メモ",
        ...overrides,
      };
    },
  };
}

test("staff reservation API rejects unauthenticated reads and writes before service-role access", async () => {
  const authentication = {
    ok: false,
    status: 401,
    error: "スタッフ認証が必要です。",
  };
  const getRuntime = executeRoute({ authentication });
  const getResponse = await getRuntime.exports.GET();
  assert.equal(getResponse.status, 401);
  assert.equal(getRuntime.clientCreated, false);

  const postRuntime = executeRoute({ authentication });
  const postResponse = await postRuntime.exports.POST(postRequest());
  assert.equal(postResponse.status, 401);
  assert.equal(postRuntime.clientCreated, false);
  assert.deepEqual(JSON.parse(JSON.stringify(postRuntime.authOptions)), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
});

test("staff reservation master data is scoped to an individual staff salon", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  const salons = runtime.calls.find((call) => call.table === "salons");
  const customers = runtime.calls.find((call) => call.table === "customers");
  const staffs = runtime.calls.find((call) => call.table === "staffs");
  assert.ok(
    salons.filters.some(
      (filter) => filter.method === "eq" && filter.column === "id" && filter.value === SALON_ID,
    ),
  );
  assert.ok(
    customers.filters.some(
      (filter) => filter.method === "or" && filter.value.includes(SALON_ID),
    ),
  );
  assert.ok(
    staffs.filters.some(
      (filter) => filter.method === "eq" && filter.column === "salon_id" && filter.value === SALON_ID,
    ),
  );
});

test("staff reservation master data keeps the signed shared-login multi-salon path", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.exports.GET();

  assert.equal(response.status, 200);
  assert.equal(
    runtime.calls.some((call) =>
      call.filters.some(
        (filter) => filter.column === "salon_id" || filter.column === "id",
      ),
    ),
    false,
  );
});

test("individual staff cannot create a reservation for another salon", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.POST(
    postRequest({ salonId: OTHER_SALON_ID }),
  );

  assert.equal(response.status, 403);
  assert.equal(runtime.clientCreated, false);
  assert.equal(runtime.calls.length, 0);
});

test("staff reservation creation validates ownership, both calendars, and inserts server-side", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.POST(postRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    ok: true,
    id: "reservation-new",
  });

  const staffRead = runtime.calls.find(
    (call) => call.table === "staffs" && call.operation === "read",
  );
  const customerRead = runtime.calls.find(
    (call) => call.table === "customers" && call.operation === "read",
  );
  assert.ok(
    staffRead.filters.some(
      (filter) => filter.column === "salon_id" && filter.value === SALON_ID,
    ),
  );
  assert.ok(
    customerRead.filters.some(
      (filter) => filter.column === "id" && filter.value === CUSTOMER_ID,
    ),
  );

  for (const table of ["reservations", "external_calendar_blocks"]) {
    const overlapRead = runtime.calls.find(
      (call) => call.table === table && call.operation === "read",
    );
    assert.ok(overlapRead, `${table} overlap was checked`);
    assert.ok(
      overlapRead.filters.some(
        (filter) => filter.column === "salon_id" && filter.value === SALON_ID,
      ),
    );
    assert.ok(overlapRead.filters.some((filter) => filter.method === "lt"));
    assert.ok(overlapRead.filters.some((filter) => filter.method === "gt"));
  }

  const insert = runtime.calls.find(
    (call) => call.table === "reservations" && call.operation === "insert",
  );
  assert.ok(insert);
  assert.deepEqual(JSON.parse(JSON.stringify(insert.insert)), [
    {
      salon_id: SALON_ID,
      customer_id: CUSTOMER_ID,
      staff_id: STAFF_ID,
      menu: "ワンカラー",
      start_at: "2099-10-19T01:00:00.000Z",
      end_at: "2099-10-19T02:30:00.000Z",
      status: "予約",
      memo: "確認メモ",
    },
  ]);
});

test("staff reservation creation returns the existing reservation for a repeated operation", async () => {
  const existing = {
    id: OPERATION_ID,
    salon_id: SALON_ID,
    customer_id: CUSTOMER_ID,
    staff_id: STAFF_ID,
    menu: "ワンカラー",
    start_at: "2099-10-19T01:00:00+00:00",
    end_at: "2099-10-19T02:30:00+00:00",
    status: "予約",
    memo: "確認メモ",
  };
  const runtime = executeRoute({
    authentication: principal(),
    rows: { operationSingle: { data: existing, error: null } },
  });
  const response = await runtime.exports.POST(
    postRequest({ operationId: OPERATION_ID }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    ok: true,
    id: OPERATION_ID,
    replayed: true,
  });
  assert.equal(
    runtime.calls.some((call) => call.operation === "insert"),
    false,
  );
  assert.equal(
    runtime.calls.some((call) => call.filters.some((filter) => filter.method === "lt")),
    false,
  );
});

test("staff reservation creation rejects a repeated operation with different content", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      operationSingle: {
        data: {
          id: OPERATION_ID,
          salon_id: SALON_ID,
          customer_id: CUSTOMER_ID,
          staff_id: STAFF_ID,
          menu: "別メニュー",
          start_at: "2099-10-19T01:00:00.000Z",
          end_at: "2099-10-19T02:30:00.000Z",
          status: "予約",
          memo: "確認メモ",
        },
        error: null,
      },
    },
  });
  const response = await runtime.exports.POST(
    postRequest({ operationId: OPERATION_ID }),
  );

  assert.equal(response.status, 409);
  assert.equal(
    runtime.calls.some((call) => call.operation === "insert"),
    false,
  );
});

test("staff reservation creation converges when a concurrent operation wins the insert", async () => {
  const existing = {
    id: OPERATION_ID,
    salon_id: SALON_ID,
    customer_id: CUSTOMER_ID,
    staff_id: STAFF_ID,
    menu: "ワンカラー",
    start_at: "2099-10-19T01:00:00.000Z",
    end_at: "2099-10-19T02:30:00.000Z",
    status: "予約",
    memo: "確認メモ",
  };
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      operationSingles: [
        { data: null, error: null },
        { data: existing, error: null },
      ],
      insert: { data: null, error: { message: "duplicate key" } },
    },
  });
  const response = await runtime.exports.POST(
    postRequest({ operationId: OPERATION_ID }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.replayed, true);
  const insert = runtime.calls.find((call) => call.operation === "insert");
  assert.equal(insert.insert[0].id, OPERATION_ID);
});

test("staff reservation creation rejects an invalid operation ID before database access", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.POST(
    postRequest({ operationId: "not-an-operation-id" }),
  );

  assert.equal(response.status, 400);
  assert.equal(runtime.clientCreated, false);
  assert.equal(runtime.calls.length, 0);
});

test("staff reservation creation refuses a matching external-calendar block", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      external_calendar_blocks: {
        data: [{ id: "block-1", staff_id: STAFF_ID }],
        error: null,
      },
    },
  });
  const response = await runtime.exports.POST(postRequest());
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /予約またはブロック/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "insert"),
    false,
  );
});

test("staff reservation creation rejects an elapsed active reservation before database access", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.POST(
    postRequest({
      startAt: "2020-10-19T01:00:00.000Z",
      endAt: "2020-10-19T02:30:00.000Z",
      status: "予約",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /開始時刻を過ぎた予約/);
  assert.equal(runtime.clientCreated, false);
  assert.equal(runtime.calls.length, 0);
});

test("staff reservation creation preserves completed-history backfill", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.POST(
    postRequest({
      startAt: "2020-10-19T01:00:00.000Z",
      endAt: "2020-10-19T02:30:00.000Z",
      status: "完了",
    }),
  );

  assert.equal(response.status, 200);
  const insert = runtime.calls.find((call) => call.operation === "insert");
  assert.equal(insert.insert[0].status, "完了");
});

test("signed shared login may create a validated reservation for the selected salon", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.exports.POST(postRequest());

  assert.equal(response.status, 200);
  assert.equal(runtime.clientCreated, true);
});
