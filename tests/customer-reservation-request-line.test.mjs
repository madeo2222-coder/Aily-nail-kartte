// Run: node --test tests/customer-reservation-request-line.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL("../app/api/customer-reservations/[id]/route.ts", import.meta.url),
  "utf8"
);
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

class MockResponse {
  constructor(body, status = 200, headers = {}) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.headers = new Headers(headers);
  }

  async json() {
    return this.body;
  }

  async text() {
    return typeof this.body === "string" ? this.body : JSON.stringify(this.body);
  }
}

function createReadQuery(row) {
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return { data: row, error: null };
    },
  };
}

function loadRoute({
  lineResponses = [new MockResponse({}, 200)],
  lineConfigured = true,
  reservation,
} = {}) {
  const lineCalls = [];
  const lineQueue = [...lineResponses];
  const defaultReservation = {
    id: "reservation-1",
    customer_id: "customer-1",
    salon_id: "salon-1",
    status: "confirmed",
    menu: "ワンカラー",
    start_at: "2099-10-02T01:30:00.000Z",
    updated_at: "2099-09-01T00:00:00.000Z",
    source: "customer-app",
    memo: "",
  };
  const supabaseAdmin = {
    from(table) {
      if (table === "customers") {
        return createReadQuery({
          id: "customer-1",
          name: "テスト顧客",
          salon_id: "salon-1",
          line_user_id: "line-user-1",
          line_login_id: "line-login-1",
        });
      }
      if (table === "reservations") {
        return createReadQuery(reservation ?? defaultReservation);
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const exports = {};

  vm.runInNewContext(compiledRoute, {
    exports,
    AbortSignal,
    Date,
    Error,
    Headers,
    Intl,
    Number,
    Promise,
    String,
    console: { error() {}, log() {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        ...(lineConfigured
          ? {
              LINE_CHANNEL_ACCESS_TOKEN: "line-token",
              LINE_ADMIN_USER_ID: "admin-user-1",
            }
          : {}),
      },
    },
    async fetch(url, options) {
      lineCalls.push({ url, options });
      const response = lineQueue.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error("No LINE response configured");
      return response;
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
        return { createClient: () => supabaseAdmin };
      }
      if (name === "@/lib/server/lineLoginCookies") {
        return {
          LINE_SESSION_COOKIE: "line-session",
          readCustomerLineSessionCookie: () => ({
            customer_id: "customer-1",
            line_user_id: "line-login-1",
          }),
        };
      }
      if (name === "@/lib/server/customerReservationAvailability") {
        return {
          getCustomerReservationAvailability() {
            throw new Error("Unexpected availability read");
          },
          isValidCustomerBookingDate() {
            throw new Error("Unexpected date validation");
          },
          normalizeCustomerBookingDuration() {
            throw new Error("Unexpected duration normalization");
          },
        };
      }
      return require(name);
    },
  });

  async function patch(body = {}) {
    const response = await exports.PATCH(
      {
        cookies: { get: () => ({ value: "signed-session" }) },
        async json() {
          return {
            action: "request_change",
            requestMessage: "10月3日の午後へ変更希望です",
            ...body,
          };
        },
      },
      { params: Promise.resolve({ id: "reservation-1" }) }
    );

    return { body: await response.json(), status: response.status };
  }

  return { lineCalls, patch };
}

test("confirmed change request succeeds only after LINE accepts it", async () => {
  const runtime = loadRoute();
  const response = await runtime.patch();

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.match(response.body.message, /変更希望を店舗へ送りました/);
  assert.equal(runtime.lineCalls.length, 1);
  assert.match(
    runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  assert.equal(runtime.lineCalls[0].options.signal.aborted, false);
});

test("LINE failure is not reported to the customer as a sent request", async () => {
  const runtime = loadRoute({
    lineResponses: [new MockResponse("temporary failure", 500)],
  });
  const response = await runtime.patch();

  assert.equal(response.status, 502);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.retryable, true);
  assert.equal(response.body.deliveryStatus, "failed");
  assert.match(response.body.error, /通知できませんでした/);
  assert.doesNotMatch(response.body.error, /送りました/);
});

test("missing LINE configuration fails closed without making an external call", async () => {
  const runtime = loadRoute({ lineConfigured: false });
  const response = await runtime.patch({ action: "request_cancel" });

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.retryable, false);
  assert.equal(response.body.deliveryStatus, "not_configured");
  assert.equal(runtime.lineCalls.length, 0);
});

test("retry reuses one key and treats LINE duplicate acceptance as sent", async () => {
  const runtime = loadRoute({
    lineResponses: [
      new Error("LINE response lost"),
      new MockResponse({}, 409, {
        "X-Line-Accepted-Request-Id": "accepted-request-1",
      }),
    ],
  });

  const first = await runtime.patch();
  const retried = await runtime.patch();

  assert.equal(first.status, 502);
  assert.equal(first.body.deliveryStatus, "unknown");
  assert.equal(first.body.retryable, true);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.ok, true);
  assert.match(retried.body.message, /重複送信していません/);
  assert.deepEqual(
    runtime.lineCalls.map((call) => call.options.headers["X-Line-Retry-Key"]),
    [
      runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
      runtime.lineCalls[0].options.headers["X-Line-Retry-Key"],
    ]
  );
  assert.equal(runtime.lineCalls[0].options.body, runtime.lineCalls[1].options.body);
});

