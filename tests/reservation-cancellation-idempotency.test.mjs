import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/reservations/[id]/cancel/route.ts", import.meta.url),
  "utf8",
);
const editPageSource = readFileSync(
  new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const reservationStatusExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/reservation-status.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: reservationStatusExports, Set, String },
);

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

function loadRoute(status) {
  const calls = [];
  let updateCalled = false;
  let fetchCalled = false;

  const readQuery = {
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          id: "reservation-1",
          salon_id: "salon-1",
          customer_id: "customer-1",
          start_at: "2099-10-02T01:30:00.000Z",
          status,
        },
        error: null,
      };
    },
    update() {
      updateCalled = true;
      return this;
    },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    AbortController,
    Array,
    Date,
    Error,
    Intl,
    Object,
    Promise,
    Set,
    String,
    clearTimeout,
    fetch() {
      fetchCalled = true;
      throw new Error("LINE should not be called");
    },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
      },
    },
    require(name) {
      if (name === "next/server") {
        return {
          NextRequest: class {},
          NextResponse: {
            json(body, options = {}) {
              return new MockResponse(body, options.status ?? 200);
            },
          },
        };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            return { from: () => readQuery };
          },
        };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async () => ({
            ok: true,
            principal: {
              authenticationMode: "supabase",
              staffId: "staff-1",
              salonId: "salon-1",
              role: "staff",
            },
          }),
        };
      }
      if (name === "@/lib/reservation-status") {
        return reservationStatusExports;
      }
      return require(name);
    },
    setTimeout,
  });

  return {
    async post() {
      const response = await exports.POST(
        {
          async json() {
            return { sendLine: true, reason: "customer_request" };
          },
        },
        { params: Promise.resolve({ id: "reservation-1" }) },
      );
      return { body: await response.json(), status: response.status };
    },
    get fetchCalled() {
      return fetchCalled;
    },
    get updateCalled() {
      return updateCalled;
    },
  };
}

test("every supported cancelled status is idempotent and does not resend LINE", async () => {
  for (const status of [
    "キャンセル",
    "cancelled",
    "canceled",
    "cancel",
    "取消",
    "取り消し",
    " CANCELLED ",
  ]) {
    const runtime = loadRoute(status);
    const response = await runtime.post();

    assert.equal(response.status, 200, status);
    assert.equal(response.body.ok, true, status);
    assert.equal(response.body.cancelled, false, status);
    assert.equal(response.body.alreadyCancelled, true, status);
    assert.equal(response.body.line.status, "skipped", status);
    assert.match(response.body.line.message, /LINEは再送していません/, status);
    assert.equal(runtime.updateCalled, false, status);
    assert.equal(runtime.fetchCalled, false, status);
  }
});

function loadConcurrentCancellationRuntime({
  latestStatus = "来店",
  latestError = null,
  latestReservationMissing = false,
} = {}) {
  let reservationQueryCount = 0;
  let fetchCalled = false;

  const chain = (maybeSingle) => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    is() {
      return this;
    },
    maybeSingle,
  });

  const initialRead = chain(async () => ({
    data: {
      id: "reservation-1",
      salon_id: "salon-1",
      customer_id: "customer-1",
      start_at: "2099-10-02T01:30:00.000Z",
      status: "予約",
    },
    error: null,
  }));
  const conditionalUpdate = {
    update() {
      return chain(async () => ({ data: null, error: null }));
    },
  };
  const latestRead = chain(async () => ({
    data: latestReservationMissing
      ? null
      : { id: "reservation-1", status: latestStatus },
    error: latestError,
  }));

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    AbortController,
    Array,
    Date,
    Error,
    Intl,
    Object,
    Promise,
    Set,
    String,
    clearTimeout,
    fetch() {
      fetchCalled = true;
      throw new Error("LINE should not be called after a conflicting update");
    },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
      },
    },
    require(name) {
      if (name === "next/server") {
        return {
          NextRequest: class {},
          NextResponse: {
            json(body, options = {}) {
              return new MockResponse(body, options.status ?? 200);
            },
          },
        };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            return {
              from(table) {
                assert.equal(table, "reservations");
                reservationQueryCount += 1;
                if (reservationQueryCount === 1) return initialRead;
                if (reservationQueryCount === 2) return conditionalUpdate;
                if (reservationQueryCount === 3) return latestRead;
                throw new Error("Unexpected reservation query");
              },
            };
          },
        };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async () => ({
            ok: true,
            principal: {
              authenticationMode: "supabase",
              staffId: "staff-1",
              salonId: "salon-1",
              role: "staff",
            },
          }),
        };
      }
      if (name === "@/lib/reservation-status") {
        return reservationStatusExports;
      }
      return require(name);
    },
    setTimeout,
  });

  return {
    async post() {
      const response = await exports.POST(
        {
          async json() {
            return { sendLine: true, reason: "customer_request" };
          },
        },
        { params: Promise.resolve({ id: "reservation-1" }) },
      );
      return { body: await response.json(), status: response.status };
    },
    get fetchCalled() {
      return fetchCalled;
    },
    get reservationQueryCount() {
      return reservationQueryCount;
    },
  };
}

test("a concurrent non-cancellation update is not reported as cancelled", async () => {
  const runtime = loadConcurrentCancellationRuntime({ latestStatus: "来店" });
  const response = await runtime.post();

  assert.equal(response.status, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.cancelled, false);
  assert.equal(response.body.status, "reservation_changed");
  assert.match(response.body.error, /再読み込み/);
  assert.equal(runtime.reservationQueryCount, 3);
  assert.equal(runtime.fetchCalled, false);
});

test("a concurrent cancellation remains idempotent without resending LINE", async () => {
  const runtime = loadConcurrentCancellationRuntime({
    latestStatus: "キャンセル",
  });
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.cancelled, false);
  assert.equal(response.body.alreadyCancelled, true);
  assert.equal(response.body.line.status, "skipped");
  assert.equal(runtime.fetchCalled, false);
});

test("a failed conflict reread does not report cancellation success", async () => {
  const runtime = loadConcurrentCancellationRuntime({
    latestError: { message: "read failed" },
  });
  const response = await runtime.post();

  assert.equal(response.status, 500);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.cancelled, false);
  assert.match(response.body.error, /再読み込み/);
  assert.equal(runtime.fetchCalled, false);
});

test("a reservation removed during cancellation is not reported as cancelled", async () => {
  const runtime = loadConcurrentCancellationRuntime({
    latestReservationMissing: true,
  });
  const response = await runtime.post();

  assert.equal(response.status, 404);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.cancelled, false);
  assert.match(response.body.error, /見つかりません/);
  assert.equal(runtime.fetchCalled, false);
});

function loadCancellationLineRuntime(fetchImplementation) {
  let reservationQueryCount = 0;

  const chain = (maybeSingle) => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    is() {
      return this;
    },
    maybeSingle,
  });

  const reservationRead = chain(async () => ({
    data: {
      id: "reservation-1",
      salon_id: "salon-1",
      customer_id: "customer-1",
      start_at: "2099-10-02T01:30:00.000Z",
      status: "予約",
    },
    error: null,
  }));
  const reservationUpdate = {
    update() {
      return chain(async () => ({
        data: { id: "reservation-1" },
        error: null,
      }));
    },
  };
  const customerRead = chain(async () => ({
    data: {
      id: "customer-1",
      name: "予約 花子",
      salon_id: "salon-1",
      line_user_id: "line-user-1",
    },
    error: null,
  }));
  const salonRead = chain(async () => ({
    data: { id: "salon-1", name: "Aily Nail Studio" },
    error: null,
  }));

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    AbortController,
    Array,
    Date,
    Error,
    Intl,
    Object,
    Promise,
    Set,
    String,
    clearTimeout,
    fetch: fetchImplementation,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
      },
    },
    require(name) {
      if (name === "next/server") {
        return {
          NextRequest: class {},
          NextResponse: {
            json(body, options = {}) {
              return new MockResponse(body, options.status ?? 200);
            },
          },
        };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            return {
              from(table) {
                if (table === "reservations") {
                  reservationQueryCount += 1;
                  return reservationQueryCount === 1
                    ? reservationRead
                    : reservationUpdate;
                }
                if (table === "customers") return customerRead;
                if (table === "salons") return salonRead;
                throw new Error(`Unexpected table: ${table}`);
              },
            };
          },
        };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async () => ({
            ok: true,
            principal: {
              authenticationMode: "supabase",
              staffId: "staff-1",
              salonId: "salon-1",
              role: "staff",
            },
          }),
        };
      }
      if (name === "@/lib/reservation-status") {
        return reservationStatusExports;
      }
      return require(name);
    },
    setTimeout,
  });

  return async () => {
    const response = await exports.POST(
      {
        async json() {
          return { sendLine: true, reason: "customer_request" };
        },
      },
      { params: Promise.resolve({ id: "reservation-1" }) },
    );
    return { body: await response.json(), status: response.status };
  };
}

test("a lost LINE response is reported as unknown without inviting a resend", async () => {
  const post = loadCancellationLineRuntime(async () => {
    throw new Error("response lost");
  });
  const response = await post();

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.cancelled, true);
  assert.equal(response.body.line.status, "unknown");
  assert.match(response.body.line.message, /送信結果を確認できません/);
  assert.match(response.body.line.message, /再送せず/);
  assert.doesNotMatch(response.body.line.message, /送信に失敗/);
});

test("an explicit LINE rejection remains a known notification failure", async () => {
  const post = loadCancellationLineRuntime(async () => ({ ok: false }));
  const response = await post();

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.cancelled, true);
  assert.equal(response.body.line.status, "failed");
  assert.match(response.body.line.message, /送信に失敗/);
});

test("staff UI separates cancellation success from LINE warnings", () => {
  assert.match(
    editPageSource,
    /status\?: "sent" \| "skipped" \| "not_linked" \| "failed" \| "unknown"/,
  );
  assert.match(
    editPageSource,
    /lineStatus === "failed"[\s\S]{0,160}lineStatus === "not_linked"[\s\S]{0,160}lineStatus === "unknown"/,
  );
  assert.match(
    editPageSource,
    /setSuccessMessage\([\s\S]{0,220}"予約をキャンセルしました。"[\s\S]{0,220}setCancellationLineWarning/,
  );
  assert.match(
    editPageSource,
    /cancellationLineWarning \?[\s\S]{0,180}border-amber-200[\s\S]{0,180}\{cancellationLineWarning\}/,
  );
});
