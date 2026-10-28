// Run: node --test tests/reservation-confirmation-email.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL("../app/api/send-reservation-confirmed-email/route.ts", import.meta.url),
  "utf8"
);
const compiledRoute = ts.transpileModule(routeSource, {
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

const defaultReservation = {
  id: "reservation-1",
  salon_id: "salon-1",
  customer_id: "customer-1",
  staff_id: "staff-1",
  status: "confirmed",
  menu: "ワンカラー <script>alert(1)</script>",
  start_at: "2099-10-02T01:30:00.000Z",
  end_at: "2099-10-02T03:00:00.000Z",
  updated_at: "2099-10-01T00:00:00.000Z",
  source: null,
  memo: null,
};

function loadRoute({
  requestBody = { reservationId: "reservation-1" },
  requestJsonError = null,
  reservationReads = [defaultReservation, defaultReservation],
  reservationError = null,
  customer = {
    id: "customer-1",
    salon_id: "salon-1",
    name: "顧客 <b>一郎</b>",
    email: "customer@example.test",
  },
  customerReads = null,
  customerError = null,
  staff = { id: "staff-1", name: "担当 <i>A</i>" },
  staffReads = null,
  staffError = null,
  salon = { id: "salon-1", name: "Aily & Nail" },
  salonReads = null,
  salonError = null,
  sendResponses = [{ data: { id: "email-1" }, error: null }],
} = {}) {
  const reservationQueue = [...reservationReads];
  const customerQueue = customerReads ? [...customerReads] : null;
  const staffQueue = staffReads ? [...staffReads] : null;
  const salonQueue = salonReads ? [...salonReads] : null;
  const sendQueue = [...sendResponses];
  const queryCalls = [];
  const sendCalls = [];
  let clientCreated = 0;
  let resendCreated = 0;

  function createQuery(table, row, error) {
    const filters = [];
    return {
      select(columns) {
        queryCalls.push({ table, columns, filters });
        return this;
      },
      eq(column, value) {
        filters.push([column, value]);
        return this;
      },
      async maybeSingle() {
        if (table === "reservations") {
          return { data: reservationQueue.shift() ?? null, error: reservationError };
        }
        if (table === "customers" && customerQueue) {
          return { data: customerQueue.shift() ?? null, error };
        }
        if (table === "staffs" && staffQueue) {
          return { data: staffQueue.shift() ?? null, error };
        }
        if (table === "salons" && salonQueue) {
          return { data: salonQueue.shift() ?? null, error };
        }
        return { data: row, error };
      },
    };
  }

  const supabaseAdmin = {
    from(table) {
      if (table === "reservations") return createQuery(table, null, reservationError);
      if (table === "customers") return createQuery(table, customer, customerError);
      if (table === "staffs") return createQuery(table, staff, staffError);
      if (table === "salons") return createQuery(table, salon, salonError);
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const exports = {};

  vm.runInNewContext(compiledRoute, {
    exports,
    Date,
    Error,
    Intl,
    Number,
    Promise,
    String,
    console: { error() {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        RESEND_API_KEY: "resend-key",
        RESEND_FROM_EMAIL: "Aily <noreply@example.test>",
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
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            clientCreated += 1;
            return supabaseAdmin;
          },
        };
      }
      if (name === "resend") {
        return {
          Resend: class {
            constructor() {
              resendCreated += 1;
              this.emails = {
                send: async (payload, options) => {
                  sendCalls.push({ payload, options });
                  const response = sendQueue.shift();
                  if (response instanceof Error) throw response;
                  if (!response) throw new Error("No Resend response configured");
                  return response;
                },
              };
            }
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
      return require(name);
    },
  });

  async function post() {
    const response = await exports.POST({
      async json() {
        if (requestJsonError) throw requestJsonError;
        return requestBody;
      },
    });
    return { body: await response.json(), status: response.status };
  }

  return {
    get clientCreated() {
      return clientCreated;
    },
    get resendCreated() {
      return resendCreated;
    },
    post,
    queryCalls,
    sendCalls,
  };
}

test("rejects malformed confirmation email requests before privileged clients are created", async () => {
  for (const options of [
    { requestJsonError: new SyntaxError("private parser detail") },
    { requestBody: null },
    { requestBody: [] },
    { requestBody: { reservationId: 123 } },
    { requestBody: { reservationId: "   " } },
  ]) {
    const runtime = loadRoute(options);
    const response = await runtime.post();

    assert.equal(response.status, 400);
    assert.equal(response.body.sent, false);
    assert.doesNotMatch(response.body.message, /private/);
    assert.equal(runtime.clientCreated, 0);
    assert.equal(runtime.resendCreated, 0);
  }
});

test("scopes every reservation relation and sends an escaped idempotent payload", async () => {
  const runtime = loadRoute();
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.sent, true);
  assert.equal(response.body.idempotencyProtected, true);
  assert.equal(runtime.sendCalls.length, 1);
  assert.match(
    runtime.sendCalls[0].options.idempotencyKey,
    /^reservation-confirmed-email\/reservation-1\/[a-f0-9]{32}$/
  );
  assert.doesNotMatch(runtime.sendCalls[0].payload.html, /<script>|<b>|<i>/);
  assert.match(runtime.sendCalls[0].payload.html, /&lt;script&gt;|&lt;b&gt;|&lt;i&gt;/);
  assert.match(runtime.sendCalls[0].payload.text, /<script>alert\(1\)<\/script>/);

  const reservations = runtime.queryCalls.filter((call) => call.table === "reservations");
  assert.equal(reservations.length, 2);
  for (const query of reservations) {
    assert.deepEqual(query.filters, [
      ["id", "reservation-1"],
      ["salon_id", "salon-1"],
    ]);
    assert.doesNotMatch(query.columns, /\*/);
  }
  for (const table of ["customers", "staffs"]) {
    const query = runtime.queryCalls.find((call) => call.table === table);
    assert.ok(query);
    assert.deepEqual(query.filters.at(-1), ["salon_id", "salon-1"]);
  }
});

test("uses the same Resend idempotency key for the same confirmation payload", async () => {
  const runtime = loadRoute({
    reservationReads: [
      defaultReservation,
      defaultReservation,
      defaultReservation,
      defaultReservation,
    ],
    sendResponses: [
      { data: { id: "email-1" }, error: null },
      { data: { id: "email-1" }, error: null },
    ],
  });

  assert.equal((await runtime.post()).status, 200);
  assert.equal((await runtime.post()).status, 200);
  assert.equal(runtime.sendCalls.length, 2);
  assert.equal(
    runtime.sendCalls[0].options.idempotencyKey,
    runtime.sendCalls[1].options.idempotencyKey
  );
  assert.deepEqual(runtime.sendCalls[0].payload, runtime.sendCalls[1].payload);
});

test("sends confirmation email for legacy full-width and spaced confirmed statuses", async () => {
  for (const status of [" ＣＯＮＦＩＲＭＥＤ ", " 予 約 確 定 "]) {
    const reservation = { ...defaultReservation, status };
    const runtime = loadRoute({
      reservationReads: [reservation, reservation],
    });
    const response = await runtime.post();

    assert.equal(response.status, 200);
    assert.equal(response.body.sent, true);
    assert.equal(response.body.idempotencyProtected, true);
    assert.equal(runtime.sendCalls.length, 1);
  }
});

test("does not email an unconfirmed reservation", async () => {
  const runtime = loadRoute({
    reservationReads: [{ ...defaultReservation, status: "pending" }],
  });
  const response = await runtime.post();

  assert.equal(response.status, 409);
  assert.match(response.body.message, /確定済み/);
  assert.equal(runtime.sendCalls.length, 0);
  assert.equal(runtime.resendCreated, 0);
});

test("does not send Naily confirmation email for a legacy external reservation", async () => {
  for (const reservation of [
    { ...defaultReservation, source: "ＭＩＮＩＭＯ" },
    { ...defaultReservation, memo: "ＨＰＢ予約番号：Ａ１２３４５６" },
  ]) {
    const runtime = loadRoute({ reservationReads: [reservation] });
    const response = await runtime.post();

    assert.equal(response.status, 409);
    assert.equal(response.body.sent, false);
    assert.match(response.body.message, /HPB・ミニモ/);
    assert.equal(runtime.resendCreated, 0);
    assert.equal(runtime.sendCalls.length, 0);
  }
});

test("skips a customer without email before creating Resend", async () => {
  const runtime = loadRoute({
    customer: { id: "customer-1", salon_id: "salon-1", name: "顧客" },
  });
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.sent, false);
  assert.match(response.body.message, /未登録/);
  assert.equal(runtime.resendCreated, 0);
  assert.equal(runtime.sendCalls.length, 0);
});

test("stops when the reservation changes immediately before sending", async () => {
  const runtime = loadRoute({
    reservationReads: [
      defaultReservation,
      { ...defaultReservation, start_at: "2099-10-02T02:00:00.000Z" },
    ],
  });
  const response = await runtime.post();

  assert.equal(response.status, 409);
  assert.equal(response.body.sent, false);
  assert.match(response.body.message, /読み込み直して/);
  assert.equal(runtime.resendCreated, 0);
  assert.equal(runtime.sendCalls.length, 0);
});

test("stops when the customer email changes immediately before sending", async () => {
  const runtime = loadRoute({
    customerReads: [
      {
        id: "customer-1",
        salon_id: "salon-1",
        name: "顧客 一郎",
        email: "old-address@example.test",
      },
      {
        id: "customer-1",
        salon_id: "salon-1",
        name: "顧客 一郎",
        email: "new-address@example.test",
      },
    ],
  });
  const response = await runtime.post();

  assert.equal(response.status, 409);
  assert.equal(response.body.sent, false);
  assert.match(response.body.message, /読み込み直して/);
  assert.equal(runtime.resendCreated, 0);
  assert.equal(runtime.sendCalls.length, 0);
});

test("stops when customer, staff, or salon mail content disappears before sending", async () => {
  for (const options of [
    { customerReads: [
      { id: "customer-1", salon_id: "salon-1", name: "顧客", email: "customer@example.test" },
      null,
    ] },
    { salonReads: [
      { id: "salon-1", name: "Aily & Nail" },
      null,
    ] },
    { staffReads: [
      { id: "staff-1", name: "担当 A" },
      null,
    ] },
  ]) {
    const runtime = loadRoute(options);
    const response = await runtime.post();

    assert.equal(response.status, 409);
    assert.equal(response.body.sent, false);
    assert.equal(runtime.resendCreated, 0);
    assert.equal(runtime.sendCalls.length, 0);
  }
});

test("marks a lost Resend response as safely retryable within the provider window", async () => {
  const runtime = loadRoute({
    sendResponses: [new Error("private network detail")],
  });
  const response = await runtime.post();

  assert.equal(response.status, 502);
  assert.equal(response.body.sent, false);
  assert.equal(response.body.retryable, true);
  assert.equal(response.body.retryWindowHours, 24);
  assert.match(response.body.message, /24時間以内/);
  assert.doesNotMatch(response.body.message, /private/);
});

test("only recommends retry for transient Resend errors", async () => {
  for (const [name, retryable] of [
    ["concurrent_idempotent_requests", true],
    ["rate_limit_exceeded", true],
    ["validation_error", false],
  ]) {
    const runtime = loadRoute({
      sendResponses: [{ data: null, error: { name, message: "private provider detail" } }],
    });
    const response = await runtime.post();

    assert.equal(response.status, 502);
    assert.equal(response.body.sent, false);
    assert.equal(response.body.retryable, retryable);
    assert.doesNotMatch(response.body.message, /private|provider/);
  }
});

test("fails closed when scoped customer data cannot be confirmed", async () => {
  for (const options of [
    { customer: null },
    { customerError: { message: "private customer query detail" } },
  ]) {
    const runtime = loadRoute(options);
    const response = await runtime.post();

    assert.equal(response.body.sent, false);
    assert.equal(runtime.resendCreated, 0);
    assert.equal(runtime.sendCalls.length, 0);
    assert.doesNotMatch(response.body.message, /private/);
  }
});

test("both staff confirmation screens invoke the guarded email API only after confirmation", () => {
  const listPage = readFileSync(
    new URL("../app/reservations/ReservationsPageClient.tsx", import.meta.url),
    "utf8"
  );
  const editPage = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    listPage,
    /if \(result\.confirmed \|\| result\.alreadyConfirmed\) \{[\s\S]{0,400}sendReservationConfirmedEmail\(/
  );
  assert.match(
    listPage,
    /async function sendReservationConfirmedEmail[\s\S]{0,240}\/api\/send-reservation-confirmed-email/
  );
  assert.match(
    editPage,
    /if \(confirmation\.confirmed \|\| confirmation\.alreadyConfirmed\) \{[\s\S]{0,260}sendConfirmationEmailNotice\(/
  );
  assert.match(
    editPage,
    /async function sendConfirmationEmailNotice[\s\S]{0,240}\/api\/send-reservation-confirmed-email/
  );
  for (const page of [listPage, editPage]) {
    assert.match(page, /body: JSON\.stringify\(\{ reservationId(?:: id)? \}\)/);
  }
});
