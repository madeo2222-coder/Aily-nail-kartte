import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const createSource = readFileSync(
  new URL("../app/api/external-calendar-blocks/route.ts", import.meta.url),
  "utf8",
);
const deleteSource = readFileSync(
  new URL(
    "../app/api/external-calendar-blocks/delete/route.ts",
    import.meta.url,
  ),
  "utf8",
);

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

const compiledCreate = compile(createSource);
const compiledDelete = compile(deleteSource);
const submissionExports = {};
vm.runInNewContext(
  compile(
    readFileSync(
      new URL(
        "../lib/external-calendar-block-submission.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  { exports: submissionExports, JSON, RegExp },
);

const SALON_ID = "e120ed90-fded-41b8-b3fe-f486e84f2418";
const OTHER_SALON_ID = "954e4418-4606-4932-8f03-87dfbe962967";
const STAFF_ID = "e568f9c8-3c8f-4f6b-9aa4-e9ded5e126e9";
const OPERATION_ID = "55555555-5555-4555-8555-555555555555";

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

function request(overrides = {}) {
  return {
    async json() {
      return {
        salonId: SALON_ID,
        staffId: STAFF_ID,
        source: "HPB",
        title: "外部予約",
        date: "2026-10-20",
        startTime: "10:00",
        endTime: "11:30",
        memo: "受付番号123",
        ...overrides,
      };
    },
  };
}

function executeCreate({ authentication, rows = {} }) {
  const calls = [];
  let authOptions = null;
  let clientCreated = false;
  let existingOperationRead = 0;

  function resultFor(call, terminal) {
    if (call.operation === "insert") {
      return rows.insert || { data: { id: "block-new" }, error: null };
    }
    if (terminal === "maybeSingle" && call.table === "staffs") {
      return (
        rows.staffSingle || {
          data: { id: STAFF_ID, salon_id: SALON_ID, is_active: true },
          error: null,
        }
      );
    }
    if (
      terminal === "maybeSingle" &&
      call.table === "external_calendar_blocks" &&
      call.filters.some(
        (filter) => filter.column === "id" && filter.value === OPERATION_ID,
      )
    ) {
      const configured = rows.existingOperations || [rows.existingOperation];
      const value = configured[existingOperationRead] ?? null;
      existingOperationRead += 1;
      return { data: value, error: null };
    }
    return rows[call.table] || { data: [], error: null };
  }

  function makeQuery(table) {
    const call = { table, operation: "read", filters: [], selects: [] };
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
      lt(column, value) {
        call.filters.push({ method: "lt", column, value });
        return query;
      },
      gt(column, value) {
        call.filters.push({ method: "gt", column, value });
        return query;
      },
      order(column, options) {
        call.order = { column, options };
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
  vm.runInNewContext(compiledCreate, {
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
      if (name === "@/lib/external-calendar-block-submission") {
        return submissionExports;
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

test("external block API rejects unauthenticated reads and writes before service-role access", async () => {
  const authentication = {
    ok: false,
    status: 401,
    error: "スタッフ認証が必要です。",
  };
  const getRuntime = executeCreate({ authentication });
  const getResponse = await getRuntime.exports.GET();
  assert.equal(getResponse.status, 401);
  assert.equal(getRuntime.clientCreated, false);

  const postRuntime = executeCreate({ authentication });
  const postResponse = await postRuntime.exports.POST(request());
  assert.equal(postResponse.status, 401);
  assert.equal(postRuntime.clientCreated, false);
  assert.deepEqual(JSON.parse(JSON.stringify(postRuntime.authOptions)), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
});

test("individual staff sees only active staff in their salon", async () => {
  const runtime = executeCreate({ authentication: principal() });
  const response = await runtime.exports.GET();

  assert.equal(response.status, 200);
  const read = runtime.calls.find((call) => call.table === "staffs");
  assert.ok(
    read.filters.some(
      (filter) => filter.column === "salon_id" && filter.value === SALON_ID,
    ),
  );
  assert.ok(
    read.filters.some(
      (filter) => filter.column === "is_active" && filter.value === true,
    ),
  );
});

test("signed shared login keeps the active multi-salon staff list", async () => {
  const runtime = executeCreate({ authentication: principal("legacy") });
  const response = await runtime.exports.GET();

  assert.equal(response.status, 200);
  const read = runtime.calls.find((call) => call.table === "staffs");
  assert.equal(
    read.filters.some((filter) => filter.column === "salon_id"),
    false,
  );
});

test("individual staff cannot post a block for another salon", async () => {
  const runtime = executeCreate({ authentication: principal() });
  const response = await runtime.exports.POST(
    request({ salonId: OTHER_SALON_ID }),
  );

  assert.equal(response.status, 403);
  assert.equal(runtime.clientCreated, false);
});

test("external block creation rejects normalized invalid dates and times", async () => {
  for (const overrides of [
    { date: "2026-02-31" },
    { startTime: "10:99" },
    { startTime: "11:00", endTime: "10:30" },
  ]) {
    const runtime = executeCreate({ authentication: principal() });
    const response = await runtime.exports.POST(request(overrides));

    assert.equal(response.status, 400);
    assert.equal(runtime.clientCreated, false);
  }
});

test("external block creation validates staff and both calendars before inserting", async () => {
  const runtime = executeCreate({ authentication: principal() });
  const response = await runtime.exports.POST(request());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.id, "block-new");

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
    (call) =>
      call.table === "external_calendar_blocks" && call.operation === "insert",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(insert.insert)), {
    salon_id: SALON_ID,
    staff_id: STAFF_ID,
    source: "HPB",
    title: "外部予約",
    start_at: "2026-10-20T01:00:00.000Z",
    end_at: "2026-10-20T02:30:00.000Z",
    memo: "受付番号123",
  });
});

test("external block creation stores the operation ID as the block ID", async () => {
  const runtime = executeCreate({ authentication: principal() });
  const response = await runtime.exports.POST(
    request({ operationId: OPERATION_ID }),
  );

  assert.equal(response.status, 200);
  const insert = runtime.calls.find(
    (call) =>
      call.table === "external_calendar_blocks" && call.operation === "insert",
  );
  assert.equal(insert.insert.id, OPERATION_ID);
});

test("external block creation replays an identical completed operation", async () => {
  const existing = {
    id: OPERATION_ID,
    salon_id: SALON_ID,
    staff_id: STAFF_ID,
    source: "HPB",
    title: "外部予約",
    start_at: "2026-10-20T01:00:00.000Z",
    end_at: "2026-10-20T02:30:00.000Z",
    memo: "受付番号123",
  };
  const runtime = executeCreate({
    authentication: principal(),
    rows: { existingOperation: existing },
  });
  const response = await runtime.exports.POST(
    request({ operationId: OPERATION_ID }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.id, OPERATION_ID);
  assert.equal(body.replayed, true);
  assert.equal(
    runtime.calls.some((call) => call.operation === "insert"),
    false,
  );
});

test("external block creation rejects an operation ID reused for different content", async () => {
  const runtime = executeCreate({
    authentication: principal(),
    rows: {
      existingOperation: {
        id: OPERATION_ID,
        salon_id: SALON_ID,
        staff_id: STAFF_ID,
        source: "HPB",
        title: "別の外部予約",
        start_at: "2026-10-20T01:00:00.000Z",
        end_at: "2026-10-20T02:30:00.000Z",
        memo: "受付番号123",
      },
    },
  });
  const response = await runtime.exports.POST(
    request({ operationId: OPERATION_ID }),
  );

  assert.equal(response.status, 409);
  assert.equal(
    runtime.calls.some((call) => call.operation === "insert"),
    false,
  );
});

test("external block creation converges after a concurrent insert wins", async () => {
  const existing = {
    id: OPERATION_ID,
    salon_id: SALON_ID,
    staff_id: STAFF_ID,
    source: "HPB",
    title: "外部予約",
    start_at: "2026-10-20T01:00:00.000Z",
    end_at: "2026-10-20T02:30:00.000Z",
    memo: "受付番号123",
  };
  const runtime = executeCreate({
    authentication: principal(),
    rows: {
      existingOperations: [null, existing],
      insert: { data: null, error: { message: "duplicate key" } },
    },
  });
  const response = await runtime.exports.POST(
    request({ operationId: OPERATION_ID }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.id, OPERATION_ID);
  assert.equal(body.replayed, true);
  assert.equal(
    runtime.calls.filter((call) => call.operation === "insert").length,
    1,
  );
});

test("external block creation rejects an invalid operation ID", async () => {
  const runtime = executeCreate({ authentication: principal() });
  const response = await runtime.exports.POST(
    request({ operationId: "not-an-operation-id" }),
  );

  assert.equal(response.status, 400);
  assert.equal(runtime.clientCreated, false);
});

test("external block creation refuses a matching non-cancelled reservation", async () => {
  const runtime = executeCreate({
    authentication: principal(),
    rows: {
      reservations: {
        data: [{ id: "reservation-1", staff_id: STAFF_ID, status: "予約" }],
        error: null,
      },
    },
  });
  const response = await runtime.exports.POST(request());
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /予約またはブロック/);
  assert.equal(
    runtime.calls.some((call) => call.operation === "insert"),
    false,
  );
});

test("signed shared login may create a validated block for the selected staff salon", async () => {
  const runtime = executeCreate({ authentication: principal("legacy") });
  const response = await runtime.exports.POST(request());

  assert.equal(response.status, 200);
  const staffRead = runtime.calls.find(
    (call) => call.table === "staffs" && call.operation === "read",
  );
  assert.ok(
    staffRead.filters.some(
      (filter) => filter.column === "salon_id" && filter.value === SALON_ID,
    ),
  );
});

function executeDelete({
  authentication,
  block,
  deleted = true,
  afterDeleteBlock = block,
}) {
  const calls = [];
  let clientCreated = false;
  let blockReadCount = 0;

  function makeQuery(table) {
    const call = { table, operation: "read", filters: [], selects: [] };
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
      is(column, value) {
        call.filters.push({ method: "is", column, value });
        return query;
      },
      delete() {
        call.operation = "delete";
        return query;
      },
      maybeSingle() {
        if (call.operation === "delete") {
          return Promise.resolve({
            data: deleted ? { id: block.id } : null,
            error: null,
          });
        }
        if (table === "external_calendar_blocks") {
          const data = blockReadCount === 0 ? block : afterDeleteBlock;
          blockReadCount += 1;
          return Promise.resolve({ data, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return query;
  }

  const exports = {};
  vm.runInNewContext(compiledDelete, {
    exports,
    Error,
    Promise,
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

  return { exports, calls, get clientCreated() { return clientCreated; } };
}

const BLOCK = { id: "block-1", salon_id: SALON_ID, staff_id: STAFF_ID };

test("external block deletion preserves salon ownership for individual staff", async () => {
  const runtime = executeDelete({ authentication: principal(), block: BLOCK });
  const response = await runtime.exports.POST({
    json: async () => ({ id: BLOCK.id }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.id, BLOCK.id);
  const deletion = runtime.calls.find((call) => call.operation === "delete");
  assert.ok(
    deletion.filters.some(
      (filter) => filter.column === "salon_id" && filter.value === SALON_ID,
    ),
  );
});

test("external block deletion rejects a block in another salon", async () => {
  const runtime = executeDelete({
    authentication: principal(),
    block: { ...BLOCK, salon_id: OTHER_SALON_ID },
  });
  const response = await runtime.exports.POST({
    json: async () => ({ id: BLOCK.id }),
  });

  assert.equal(response.status, 403);
  assert.equal(
    runtime.calls.some((call) => call.operation === "delete"),
    false,
  );
});

test("signed shared login may delete a selected existing block", async () => {
  const runtime = executeDelete({
    authentication: principal("legacy"),
    block: BLOCK,
  });
  const response = await runtime.exports.POST({
    json: async () => ({ id: BLOCK.id }),
  });

  assert.equal(response.status, 200);
  assert.equal(
    runtime.calls.some((call) => call.operation === "delete"),
    true,
  );
});

test("external block deletion is idempotent when the block is already absent", async () => {
  const runtime = executeDelete({
    authentication: principal(),
    block: null,
  });
  const response = await runtime.exports.POST({
    json: async () => ({ id: BLOCK.id }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.id, BLOCK.id);
  assert.equal(body.alreadyDeleted, true);
  assert.equal(
    runtime.calls.some((call) => call.operation === "delete"),
    false,
  );
});

test("external block deletion converges when another request deleted the row", async () => {
  const runtime = executeDelete({
    authentication: principal(),
    block: BLOCK,
    deleted: false,
    afterDeleteBlock: null,
  });
  const response = await runtime.exports.POST({
    json: async () => ({ id: BLOCK.id }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.id, BLOCK.id);
  assert.equal(body.alreadyDeleted, true);
});

test("external block deletion does not report success when the row remains", async () => {
  const runtime = executeDelete({
    authentication: principal(),
    block: BLOCK,
    deleted: false,
  });
  const response = await runtime.exports.POST({
    json: async () => ({ id: BLOCK.id }),
  });

  assert.equal(response.status, 409);
});
