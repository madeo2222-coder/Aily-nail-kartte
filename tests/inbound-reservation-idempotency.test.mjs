// Run: node --test tests/inbound-reservation-idempotency.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL("../app/api/inbound-reservations/route.ts", import.meta.url),
  "utf8",
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
    this.ok = status >= 200 && status < 300;
  }

  async json() {
    return this.body;
  }

  async text() {
    return typeof this.body === "string" ? this.body : JSON.stringify(this.body);
  }
}

const requestBody = {
  menu: "[Inbound] Gel design / 2 guests",
  date: "2099-11-15",
  time: "10:00",
  salonId: "salon-1",
  durationMinutes: 90,
  memo: "Customer note",
  guestCount: 2,
  customerName: "Guest A",
  customerEmail: "Guest@Example.com",
};

function loadRoute({
  existingRows = [],
  existingError = null,
  staffs = [
    { id: "staff-1", name: "Staff 1", salon_id: "salon-1" },
    { id: "staff-2", name: "Staff 2", salon_id: "salon-1" },
  ],
  overlaps = [],
  insertError = null,
} = {}) {
  const externalCalls = [];
  const queries = [];
  const inserts = [];

  function createQuery(table) {
    const record = { table, select: "", eq: [], in: null, insert: null };
    queries.push(record);
    const query = {
      select(value) {
        record.select = value;
        return this;
      },
      eq(field, value) {
        record.eq.push([field, value]);
        return this;
      },
      lt() {
        return this;
      },
      gt() {
        return this;
      },
      in(field, values) {
        record.in = [field, values];
        return this;
      },
      insert(rows) {
        record.insert = rows;
        inserts.push(rows);
        return {
          async select() {
            return {
              data: insertError ? null : rows.map((row) => ({ id: row.id })),
              error: insertError,
            };
          },
        };
      },
      then(resolve, reject) {
        let result;
        if (table === "staffs") {
          result = { data: staffs, error: null };
        } else if (table === "reservations" && record.in) {
          result = { data: existingRows, error: existingError };
        } else if (table === "reservations") {
          result = { data: overlaps, error: null };
        } else {
          result = { data: null, error: { message: `Unexpected table: ${table}` } };
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  }

  const exports = {};
  vm.runInNewContext(compiledRoute, {
    exports,
    Date,
    Error,
    Intl,
    Map,
    Math,
    Number,
    Promise,
    Set,
    String,
    console: { error() {}, log() {} },
    process: {
      env: {
        LINE_ADMIN_USER_ID: "line-admin",
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
        RESEND_API_KEY: "re_test",
        RESEND_FROM_EMAIL: "Aily <hello@example.test>",
        RESERVATION_NOTIFY_EMAIL: "staff@example.test",
      },
    },
    async fetch(url, options) {
      externalCalls.push({ url, options });
      return new MockResponse({}, 200);
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
      if (name === "@/lib/supabase") {
        return { supabase: { from: createQuery } };
      }
      if (name === "@/lib/reservation-status") {
        return { isCancelledReservationStatus: () => false };
      }
      return require(name);
    },
  });

  async function post(body = requestBody) {
    const response = await exports.POST({ async json() { return body; } });
    return { body: await response.json(), status: response.status };
  }

  return { externalCalls, inserts, post, queries };
}

test("uses stable reservation IDs and notification keys for the same inbound request", async () => {
  const first = loadRoute();
  const firstResponse = await first.post();
  const second = loadRoute();
  const secondResponse = await second.post();

  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.body.replayed, false);
  assert.equal(first.inserts.length, 1);
  assert.equal(first.inserts[0].length, 2);
  assert.deepEqual(firstResponse.body.reservationIds, first.inserts[0].map((row) => row.id));
  assert.deepEqual(firstResponse.body.reservationIds, secondResponse.body.reservationIds);
  assert.match(firstResponse.body.reservationIds[0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(firstResponse.body.reservationIds[0], firstResponse.body.reservationIds[1]);

  const firstHeaders = first.externalCalls.map((call) => call.options.headers);
  const secondHeaders = second.externalCalls.map((call) => call.options.headers);
  assert.equal(firstHeaders.length, 3);
  assert.deepEqual(
    firstHeaders.map((headers) => headers["Idempotency-Key"] || headers["X-Line-Retry-Key"]),
    secondHeaders.map((headers) => headers["Idempotency-Key"] || headers["X-Line-Retry-Key"]),
  );
  assert.equal(new Set(firstHeaders.map((headers) => headers["Idempotency-Key"] || headers["X-Line-Retry-Key"])).size, 3);
});

test("replays an existing complete request without inserting or notifying again", async () => {
  const first = loadRoute();
  const firstResponse = await first.post();
  const existingRows = first.inserts[0].map((row) => ({
    id: row.id,
    salon_id: row.salon_id,
    status: "confirmed",
    staff_id: row.staff_id,
    start_at: row.start_at,
    end_at: row.end_at,
    menu: row.menu,
  }));
  const replay = loadRoute({ existingRows, staffs: [], overlaps: [{ id: "busy" }] });
  const replayResponse = await replay.post();

  assert.equal(replayResponse.status, 200);
  assert.equal(replayResponse.body.ok, true);
  assert.equal(replayResponse.body.replayed, true);
  assert.equal(
    JSON.stringify(replayResponse.body.reservationIds),
    JSON.stringify(firstResponse.body.reservationIds),
  );
  assert.equal(replay.inserts.length, 0);
  assert.equal(replay.externalCalls.length, 0);
  assert.equal(replay.queries.some((query) => query.table === "staffs"), false);
});

test("fails closed for a partial or mismatched deterministic reservation set", async () => {
  const first = loadRoute();
  await first.post();
  const row = first.inserts[0][0];

  for (const existingRows of [
    [{ ...row, status: "requested" }],
    first.inserts[0].map((item) => ({ ...item, menu: "different menu" })),
  ]) {
    const runtime = loadRoute({ existingRows });
    const response = await runtime.post();

    assert.equal(response.status, 409);
    assert.equal(response.body.ok, false);
    assert.equal(runtime.inserts.length, 0);
    assert.equal(runtime.externalCalls.length, 0);
  }
});

test("stops before availability and notifications when replay lookup fails", async () => {
  const runtime = loadRoute({ existingError: { message: "read failed" } });
  const response = await runtime.post();

  assert.equal(response.status, 500);
  assert.equal(response.body.ok, false);
  assert.equal(runtime.inserts.length, 0);
  assert.equal(runtime.externalCalls.length, 0);
  assert.equal(runtime.queries.some((query) => query.table === "staffs"), false);
});
