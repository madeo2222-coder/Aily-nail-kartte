import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL("../app/api/reservations/[id]/staff-edit/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(routeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const RESERVATION_ID = "57a77313-2caf-451f-bd12-9918ee27bfe0";
const SALON_ID = "e120ed90-fded-41b8-b3fe-f486e84f2418";
const OTHER_SALON_ID = "954e4418-4606-4932-8f03-87dfbe962967";
const STAFF_ID = "e568f9c8-3c8f-4f6b-9aa4-e9ded5e126e9";
const CUSTOMER_ID = "d9dfb5b6-f8c8-4e83-8c5c-ce241b7212c9";

const reservation = {
  id: RESERVATION_ID,
  salon_id: SALON_ID,
  customer_id: CUSTOMER_ID,
  staff_id: STAFF_ID,
  menu: "ワンカラー",
  start_at: "2099-10-19T01:00:00.000Z",
  end_at: "2099-10-19T02:30:00.000Z",
  status: "予約",
  memo: "確認メモ",
};

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

function executeRoute({ authentication, rows = {} }) {
  const calls = [];
  let authOptions = null;
  let clientCreated = false;

  function resultFor(call, terminal) {
    if (call.operation === "update") {
      return rows.update || { data: { id: RESERVATION_ID }, error: null };
    }
    if (call.operation === "delete") {
      return rows.delete || { data: { id: RESERVATION_ID }, error: null };
    }
    if (terminal === "maybeSingle") {
      if (call.table === "reservations") {
        return rows.reservationSingle || { data: reservation, error: null };
      }
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
    }

    if (call.table === "reservations") {
      return rows.reservations || { data: [], error: null };
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
      is(column, value) {
        call.filters.push({ method: "is", column, value });
        return query;
      },
      neq(column, value) {
        call.filters.push({ method: "neq", column, value });
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
      update(value) {
        call.operation = "update";
        call.value = value;
        return query;
      },
      delete() {
        call.operation = "delete";
        return query;
      },
      maybeSingle() {
        return Promise.resolve(resultFor(call, "maybeSingle"));
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

function context(id = RESERVATION_ID) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(overrides = {}) {
  return {
    async json() {
      return {
        salonId: SALON_ID,
        customerId: CUSTOMER_ID,
        staffId: STAFF_ID,
        menu: "ワンカラー",
        startAt: "2099-10-19T01:00:00.000Z",
        endAt: "2099-10-19T02:30:00.000Z",
        status: "来店",
        memo: "更新メモ",
        expectedCustomerId: reservation.customer_id,
        expectedStaffId: reservation.staff_id,
        expectedMenu: reservation.menu,
        expectedStatus: reservation.status,
        expectedMemo: reservation.memo,
        expectedStartAt: reservation.start_at,
        expectedEndAt: reservation.end_at,
        ...overrides,
      };
    },
  };
}

function deleteRequest(overrides = {}) {
  return {
    async json() {
      return {
        expectedCustomerId: reservation.customer_id,
        expectedStaffId: reservation.staff_id,
        expectedMenu: reservation.menu,
        expectedStatus: reservation.status,
        expectedMemo: reservation.memo,
        expectedStartAt: reservation.start_at,
        expectedEndAt: reservation.end_at,
        ...overrides,
      };
    },
  };
}

test("staff edit API rejects unauthenticated reads and writes before service-role access", async () => {
  const authentication = {
    ok: false,
    status: 401,
    error: "スタッフ認証が必要です。",
  };

  for (const method of ["GET", "PATCH", "DELETE"]) {
    const runtime = executeRoute({ authentication });
    const request = method === "PATCH" ? patchRequest() : {};
    const response = await runtime.exports[method](request, context());

    assert.equal(response.status, 401);
    assert.equal(runtime.clientCreated, false);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions)), {
      allowedRoles: ["owner", "staff"],
      legacyAllowed: true,
      salonContextRequired: false,
    });
  }
});

test("individual staff edit data is scoped to the authenticated salon", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.GET({}, context());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  const reservationRead = runtime.calls.find(
    (call) => call.table === "reservations" && call.operation === "read",
  );
  assert.ok(
    reservationRead.filters.some(
      (filter) => filter.column === "salon_id" && filter.value === SALON_ID,
    ),
  );
  for (const table of ["salons", "staffs"]) {
    const read = runtime.calls.find((call) => call.table === table);
    assert.ok(
      read.filters.some(
        (filter) =>
          (filter.column === "id" || filter.column === "salon_id") &&
          filter.value === SALON_ID,
      ),
    );
  }
  const customersRead = runtime.calls.find(
    (call) => call.table === "customers",
  );
  assert.ok(
    customersRead.filters.some(
      (filter) => filter.method === "or" && filter.value.includes(SALON_ID),
    ),
  );
});

test("individual staff cannot move a reservation to another salon", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.PATCH(
    patchRequest({ salonId: OTHER_SALON_ID }),
    context(),
  );

  assert.equal(response.status, 403);
  assert.equal(runtime.clientCreated, false);
});

test("staff edit requires the original booking detail snapshot", async () => {
  for (const overrides of [
    { expectedCustomerId: undefined },
    { expectedStaffId: undefined },
    { expectedMenu: undefined },
    { expectedStatus: undefined },
    { expectedMemo: undefined },
    { expectedStartAt: undefined },
    { expectedEndAt: undefined },
  ]) {
    const runtime = executeRoute({ authentication: principal() });
    const response = await runtime.exports.PATCH(
      patchRequest(overrides),
      context(),
    );

    assert.equal(response.status, 400);
    assert.equal(runtime.clientCreated, false);
  }
});

test("staff edit validates membership, checks both calendars, and updates server-side", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.PATCH(patchRequest(), context());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    ok: true,
    id: RESERVATION_ID,
  });

  for (const table of ["reservations", "external_calendar_blocks"]) {
    const overlapRead = runtime.calls.find(
      (call) =>
        call.table === table &&
        call.operation === "read" &&
        call.filters.some((filter) => filter.method === "lt"),
    );
    assert.ok(overlapRead, `${table} overlap was checked`);
    assert.ok(
      overlapRead.filters.some(
        (filter) => filter.column === "salon_id" && filter.value === SALON_ID,
      ),
    );
  }

  const reservationsOverlap = runtime.calls.find(
    (call) =>
      call.table === "reservations" &&
      call.operation === "read" &&
      call.filters.some((filter) => filter.method === "neq"),
  );
  assert.ok(
    reservationsOverlap.filters.some(
      (filter) =>
        filter.method === "neq" &&
        filter.column === "id" &&
        filter.value === RESERVATION_ID,
    ),
  );

  const update = runtime.calls.find(
    (call) => call.table === "reservations" && call.operation === "update",
  );
  assert.ok(update);
  assert.equal(update.value.salon_id, SALON_ID);
  assert.equal(update.value.customer_id, CUSTOMER_ID);
  assert.equal(update.value.status, "来店");
  assert.ok(
    update.filters.some(
      (filter) => filter.column === "salon_id" && filter.value === SALON_ID,
    ),
  );
  assert.ok(
    update.filters.some(
      (filter) =>
        filter.column === "status" && filter.value === reservation.status,
    ),
  );
  assert.ok(
    update.filters.some(
      (filter) =>
        filter.column === "memo" && filter.value === reservation.memo,
    ),
  );
  assert.ok(
    update.filters.some(
      (filter) =>
        filter.column === "start_at" &&
        filter.value === reservation.start_at,
    ),
  );
  assert.ok(
    update.filters.some(
      (filter) =>
        filter.column === "end_at" && filter.value === reservation.end_at,
    ),
  );
  for (const [column, value] of [
    ["customer_id", reservation.customer_id],
    ["staff_id", reservation.staff_id],
    ["menu", reservation.menu],
  ]) {
    assert.ok(
      update.filters.some(
        (filter) => filter.column === column && filter.value === value,
      ),
      `${column} snapshot was guarded`,
    );
  }
});

for (const [field, value] of [
  ["customer_id", "7fffd6d9-9388-4eb6-9334-eaba7c45d100"],
  ["staff_id", "3a0a80ec-9a09-42f7-8cc4-1673fd4c5e55"],
  ["menu", "同期後の最新メニュー"],
]) {
  test(`staff edit refuses a stale screen after booking sync changed ${field}`, async () => {
    const runtime = executeRoute({
      authentication: principal(),
      rows: {
        reservationSingle: {
          data: { ...reservation, [field]: value },
          error: null,
        },
      },
    });
    const response = await runtime.exports.PATCH(patchRequest(), context());
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.match(body.error, /最新の内容を読み込み直して/);
    assert.equal(
      runtime.calls.some((call) => call.operation === "update"),
      false,
    );
  });
}

test("staff edit refuses a stale screen after booking sync changed the memo", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      reservationSingle: {
        data: { ...reservation, memo: "同期後の最新メモ" },
        error: null,
      },
    },
  });
  const response = await runtime.exports.PATCH(patchRequest(), context());
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /最新の内容を読み込み直して/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("staff edit refuses a stale screen after booking sync moved the time", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      reservationSingle: {
        data: {
          ...reservation,
          start_at: "2099-10-20T01:00:00.000Z",
          end_at: "2099-10-20T02:30:00.000Z",
        },
        error: null,
      },
    },
  });
  const response = await runtime.exports.PATCH(patchRequest(), context());
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /最新の内容を読み込み直して/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("staff edit reports a write-time sync race as a conflict", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: { update: { data: null, error: null } },
  });
  const response = await runtime.exports.PATCH(patchRequest(), context());
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /最新の内容を読み込み直して/);
});

test("staff edit compares an originally empty memo with IS NULL", async () => {
  const emptyMemoReservation = { ...reservation, memo: null };
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      reservationSingle: { data: emptyMemoReservation, error: null },
    },
  });
  const response = await runtime.exports.PATCH(
    patchRequest({ expectedMemo: null }),
    context(),
  );

  assert.equal(response.status, 200);
  const update = runtime.calls.find((call) => call.operation === "update");
  assert.ok(
    update.filters.some(
      (filter) =>
        filter.method === "is" &&
        filter.column === "memo" &&
        filter.value === null,
    ),
  );
});

test("staff edit guards originally unassigned booking details with IS NULL", async () => {
  const unassignedReservation = {
    ...reservation,
    customer_id: null,
    staff_id: null,
    menu: null,
  };
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      reservationSingle: { data: unassignedReservation, error: null },
    },
  });
  const response = await runtime.exports.PATCH(
    patchRequest({
      expectedCustomerId: null,
      expectedStaffId: null,
      expectedMenu: null,
    }),
    context(),
  );

  assert.equal(response.status, 200);
  const update = runtime.calls.find((call) => call.operation === "update");
  for (const column of ["customer_id", "staff_id", "menu"]) {
    assert.ok(
      update.filters.some(
        (filter) =>
          filter.method === "is" &&
          filter.column === column &&
          filter.value === null,
      ),
      `${column} null snapshot was guarded`,
    );
  }
});

test("staff edit refuses a matching external-calendar block", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      external_calendar_blocks: {
        data: [{ id: "block-1", staff_id: STAFF_ID }],
        error: null,
      },
    },
  });
  const response = await runtime.exports.PATCH(patchRequest(), context());
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /予約またはブロック/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("staff edit cannot bypass the confirmation workflow", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.PATCH(
    patchRequest({ status: "confirmed" }),
    context(),
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /予約確定にする/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("staff edit rejects moving an active reservation into elapsed time", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.PATCH(
    patchRequest({
      startAt: "2020-10-19T01:00:00.000Z",
      endAt: "2020-10-19T02:30:00.000Z",
      status: "予約",
    }),
    context(),
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /開始時刻を過ぎた日時/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "update"),
    false,
  );
});

test("staff edit preserves non-time corrections on an existing elapsed reservation", async () => {
  const elapsedReservation = {
    ...reservation,
    start_at: "2020-10-19T01:00:00.000Z",
    end_at: "2020-10-19T02:30:00.000Z",
    status: "予約",
  };
  const runtime = executeRoute({
    authentication: principal(),
    rows: { reservationSingle: { data: elapsedReservation, error: null } },
  });
  const response = await runtime.exports.PATCH(
    patchRequest({
      startAt: elapsedReservation.start_at,
      endAt: elapsedReservation.end_at,
      expectedStartAt: elapsedReservation.start_at,
      expectedEndAt: elapsedReservation.end_at,
      status: "予約",
      memo: "過去予約のメモ補正",
    }),
    context(),
  );

  assert.equal(response.status, 200);
  const update = runtime.calls.find((call) => call.operation === "update");
  assert.equal(update.value.memo, "過去予約のメモ補正");
});

test("staff delete scopes the lookup and delete to the authenticated salon", async () => {
  const runtime = executeRoute({ authentication: principal() });
  const response = await runtime.exports.DELETE(deleteRequest(), context());

  assert.equal(response.status, 200);
  const remove = runtime.calls.find((call) => call.operation === "delete");
  assert.ok(remove);
  assert.ok(
    remove.filters.some(
      (filter) => filter.column === "salon_id" && filter.value === SALON_ID,
    ),
  );
  for (const [column, value] of [
    ["customer_id", reservation.customer_id],
    ["staff_id", reservation.staff_id],
    ["menu", reservation.menu],
    ["status", reservation.status],
    ["memo", reservation.memo],
    ["start_at", reservation.start_at],
    ["end_at", reservation.end_at],
  ]) {
    assert.ok(
      remove.filters.some(
        (filter) => filter.column === column && filter.value === value,
      ),
      `${column} snapshot was guarded before delete`,
    );
  }
});

test("staff delete requires the original booking detail snapshot", async () => {
  for (const overrides of [
    { expectedCustomerId: undefined },
    { expectedStaffId: undefined },
    { expectedMenu: undefined },
    { expectedStatus: undefined },
    { expectedMemo: undefined },
    { expectedStartAt: undefined },
    { expectedEndAt: undefined },
  ]) {
    const runtime = executeRoute({ authentication: principal() });
    const response = await runtime.exports.DELETE(
      deleteRequest(overrides),
      context(),
    );

    assert.equal(response.status, 400);
    assert.equal(runtime.clientCreated, false);
  }
});

test("staff delete refuses a stale screen after booking sync changed details", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      reservationSingle: {
        data: { ...reservation, menu: "同期後の最新メニュー" },
        error: null,
      },
    },
  });
  const response = await runtime.exports.DELETE(deleteRequest(), context());
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /最新の内容を読み込み直して/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "delete"),
    false,
  );
});

test("staff delete reports a write-time sync race as a conflict", async () => {
  const runtime = executeRoute({
    authentication: principal(),
    rows: { delete: { data: null, error: null } },
  });
  const response = await runtime.exports.DELETE(deleteRequest(), context());
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /最新の内容を読み込み直して/);
});

test("staff delete guards an originally empty status with IS NULL", async () => {
  const emptyStatusReservation = { ...reservation, status: null };
  const runtime = executeRoute({
    authentication: principal(),
    rows: {
      reservationSingle: { data: emptyStatusReservation, error: null },
    },
  });
  const response = await runtime.exports.DELETE(
    deleteRequest({ expectedStatus: null }),
    context(),
  );

  assert.equal(response.status, 200);
  const remove = runtime.calls.find((call) => call.operation === "delete");
  assert.ok(
    remove.filters.some(
      (filter) =>
        filter.method === "is" &&
        filter.column === "status" &&
        filter.value === null,
    ),
  );
});

test("signed shared login keeps the validated multi-salon edit path", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.exports.PATCH(patchRequest(), context());

  assert.equal(response.status, 200);
  const detailRead = runtime.calls.find(
    (call) =>
      call.table === "reservations" &&
      call.operation === "read" &&
      !call.filters.some((filter) => filter.method === "lt"),
  );
  assert.equal(
    detailRead.filters.some((filter) => filter.column === "salon_id"),
    false,
  );
});

test("reservation edit page uses the guarded API and synchronous request locks", () => {
  const pageSource = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(pageSource, /@\/lib\/supabase/);
  assert.doesNotMatch(pageSource, /\.from\("reservations"\)/);
  assert.match(pageSource, /\/api\/reservations\/\$\{reservationId\}\/staff-edit/);
  assert.match(pageSource, /method:\s*"PATCH"/);
  assert.match(pageSource, /method:\s*"DELETE"/);
  assert.match(
    pageSource,
    /method:\s*"DELETE"[\s\S]*?expectedCustomerId:\s*initialCustomerId/,
  );
  assert.match(
    pageSource,
    /method:\s*"DELETE"[\s\S]*?expectedStatus:\s*initialStoredStatus/,
  );
  assert.match(pageSource, /mutationRequestPendingRef\.current/);
  for (const expectedField of [
    "expectedCustomerId",
    "expectedStaffId",
    "expectedMenu",
  ]) {
    assert.match(pageSource, new RegExp(expectedField));
  }
  assert.doesNotMatch(pageSource, /(?:save|delete|confirm)RequestPendingRef/);
  assert.match(pageSource, /status === "confirmed" && !wasInitiallyConfirmed/);
  assert.match(pageSource, /!pageDataLoaded/);
  assert.match(pageSource, /setInitialSource\(reservation\.source\)/);
  assert.match(pageSource, /!isExternalSynced/);
});
