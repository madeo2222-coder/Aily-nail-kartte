// Run: node --test tests/inbound-nail-tip-idempotency.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL("../app/api/inbound-nail-tip-requests/route.ts", import.meta.url),
  "utf8",
);
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const submissionHelpers = (() => {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(
      new URL("../lib/inbound-nail-tip-submission.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(source, { exports, JSON, Object, RegExp });
  return exports;
})();

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }

  async json() { return this.body; }
  async text() {
    return typeof this.body === "string" ? this.body : JSON.stringify(this.body);
  }
}

const operationId = "11111111-1111-4111-8111-111111111111";
const requestBody = {
  operationId,
  customerName: "Guest A",
  customerEmail: "guest@example.com",
  country: "France",
  instagramId: "guest-a",
  language: "en",
  orderType: "anime_character",
  designRequest: "Pink original design",
  imageUrls: ["https://example.test/design.jpg"],
  recipientName: "Guest A",
  shippingAddress: "1 Rue de Test",
  shippingCity: "Paris",
  shippingState: "Ile-de-France",
  shippingPostalCode: "75001",
  shippingPhone: "+33 1 23 45 67 89",
};

function asRow(body = requestBody) {
  return {
    id: body.operationId,
    customer_name: body.customerName,
    customer_email: body.customerEmail,
    country: body.country,
    instagram_id: body.instagramId || null,
    language: body.language,
    order_type: body.orderType,
    design_request: body.designRequest,
    image_urls: body.imageUrls,
    recipient_name: body.recipientName,
    shipping_address: body.shippingAddress,
    shipping_city: body.shippingCity,
    shipping_state: body.shippingState || null,
    shipping_postal_code: body.shippingPostalCode,
    shipping_phone: body.shippingPhone,
    status: "new",
  };
}

function loadRoute({
  existingRow = null,
  lookupError = null,
  insertError = null,
  existingAfterInsert = null,
} = {}) {
  const externalCalls = [];
  const inserts = [];
  const queries = [];
  let lookupCount = 0;
  let clientCount = 0;

  function createClient() {
    clientCount += 1;
    return {
      from(table) {
        assert.equal(table, "inbound_nail_tip_requests");
        const record = { table, select: null, eq: null };
        queries.push(record);
        return {
          select(columns) {
            record.select = columns;
            return this;
          },
          eq(field, value) {
            record.eq = [field, value];
            return this;
          },
          async maybeSingle() {
            const afterInsert = lookupCount > 0;
            lookupCount += 1;
            return {
              data:
                afterInsert && existingAfterInsert !== null
                  ? existingAfterInsert
                  : existingRow,
              error: lookupError,
            };
          },
          async insert(row) {
            inserts.push(row);
            return { data: null, error: insertError };
          },
        };
      },
    };
  }

  const exports = {};
  vm.runInNewContext(compiledRoute, {
    exports,
    URL,
    Error,
    JSON,
    Promise,
    String,
    console: { error() {}, log() {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
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
      if (name === "@supabase/supabase-js") return { createClient };
      if (name === "@/lib/inbound-nail-tip-submission") {
        return submissionHelpers;
      }
      return require(name);
    },
  });

  async function post(body = requestBody) {
    const response = await exports.POST({ async json() { return body; } });
    return { body: await response.json(), status: response.status };
  }

  async function get(id = operationId) {
    const response = await exports.GET({
      url: `https://example.test/api/inbound-nail-tip-requests?operationId=${id}`,
    });
    return { body: await response.json(), status: response.status };
  }

  return {
    externalCalls,
    get,
    get clientCount() { return clientCount; },
    inserts,
    post,
    queries,
  };
}

test("creates one request with the client operation ID and stable notification keys", async () => {
  const runtime = loadRoute();
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.replayed, false);
  assert.equal(response.body.requestId, operationId);
  assert.equal(runtime.inserts.length, 1);
  assert.equal(runtime.inserts[0].id, operationId);
  assert.equal(runtime.externalCalls.length, 3);
  assert.deepEqual(
    runtime.externalCalls.map(
      (call) =>
        call.options.headers["Idempotency-Key"] ||
        call.options.headers["X-Line-Retry-Key"],
    ),
    [
      `inbound-nail-tip/${operationId}/admin-email`,
      `inbound-nail-tip/${operationId}/customer-email`,
      operationId,
    ],
  );
});

test("replays an identical request without inserting or notifying again", async () => {
  const runtime = loadRoute({ existingRow: asRow() });
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.replayed, true);
  assert.equal(runtime.inserts.length, 0);
  assert.equal(runtime.externalCalls.length, 0);
});

test("rejects an operation ID reused for different request details", async () => {
  const runtime = loadRoute({
    existingRow: asRow({ ...requestBody, customerEmail: "other@example.com" }),
  });
  const response = await runtime.post();

  assert.equal(response.status, 409);
  assert.equal(runtime.inserts.length, 0);
  assert.equal(runtime.externalCalls.length, 0);
});

test("converges when an identical concurrent insert wins", async () => {
  const runtime = loadRoute({
    insertError: { message: "duplicate key" },
    existingAfterInsert: asRow(),
  });
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.replayed, true);
  assert.equal(runtime.inserts.length, 1);
  assert.equal(runtime.externalCalls.length, 0);
});

test("reports saved, not-found, and unknown reconciliation without exposing request data", async () => {
  const saved = loadRoute({ existingRow: asRow() });
  const savedResponse = await saved.get();
  assert.equal(savedResponse.status, 200);
  assert.equal(savedResponse.body.ok, true);
  assert.equal(savedResponse.body.status, "saved");

  const missing = loadRoute();
  const missingResponse = await missing.get();
  assert.equal(missingResponse.status, 200);
  assert.equal(missingResponse.body.status, "not_found");

  const unknown = loadRoute({ lookupError: { message: "read failed" } });
  const unknownResponse = await unknown.get();
  assert.equal(unknownResponse.status, 200);
  assert.equal(unknownResponse.body.status, "unknown");
});

test("rejects invalid operation IDs before opening the admin client", async () => {
  const runtime = loadRoute();
  const response = await runtime.get("not-a-uuid");

  assert.equal(response.status, 400);
  assert.equal(runtime.clientCount, 0);
});
