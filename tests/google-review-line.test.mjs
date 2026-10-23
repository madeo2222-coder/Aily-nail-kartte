// Run: node --test tests/google-review-line.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL("../app/api/send-google-review-line/route.ts", import.meta.url),
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

const baseVisit = {
  id: "visit-1",
  salon_id: "salon-1",
  customer_id: "customer-1",
  visit_date: "2099-10-02",
};

function loadRoute({
  visits = [baseVisit],
  latestVisit = baseVisit,
  logCheck = { data: null, error: null },
  logInsertError = null,
  lineResponses = [new MockResponse({}, 200)],
  salonResult = {
    data: {
      id: "salon-1",
      google_review_url: "https://example.test/review/salon-1",
    },
    error: null,
  },
} = {}) {
  const authCalls = [];
  const queries = [];
  const lineCalls = [];
  const logInserts = [];
  const lineQueue = [...lineResponses];
  let clientCreated = false;

  function createQuery(table) {
    const record = { table, eq: [], select: "" };
    queries.push(record);
    return {
      select(value) {
        record.select = value;
        return this;
      },
      eq(field, value) {
        record.eq.push([field, value]);
        return this;
      },
      async order() {
        assert.equal(table, "visits");
        return { data: visits, error: null };
      },
      async maybeSingle() {
        if (table === "salons") return salonResult;
        if (table === "line_notification_logs") return logCheck;
        if (table === "customers") {
          return {
            data: {
              id: "customer-1",
              name: "テスト顧客",
              line_user_id: "line-user-1",
            },
            error: null,
          };
        }
        if (table === "visits") {
          return { data: latestVisit, error: null };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      async insert(rows) {
        assert.equal(table, "line_notification_logs");
        logInserts.push(rows);
        return { error: logInsertError };
      },
    };
  }

  const supabaseAdmin = { from: createQuery };
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
    URL,
    console: { error() {} },
    process: {
      env: {
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
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
        return {
          createClient() {
            clientCreated = true;
            return supabaseAdmin;
          },
        };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async (options) => {
            authCalls.push(options);
            return {
              ok: true,
              principal: {
                authenticationMode: "supabase",
                staffId: "staff-1",
                salonId: "salon-1",
                role: "staff",
              },
            };
          },
        };
      }
      return require(name);
    },
  });

  async function post(body = { targetDate: "2099-10-02" }) {
    const response = await exports.POST({ async json() { return body; } });
    return { body: await response.json(), status: response.status };
  }

  return { authCalls, clientCreated: () => clientCreated, lineCalls, logInserts, post, queries };
}

test("scopes review reads to the authenticated salon and sends that salon's URL", async () => {
  const runtime = loadRoute();
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.sentCount, 1);
  assert.equal(runtime.lineCalls.length, 1);
  assert.equal(runtime.logInserts.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.authCalls[0])),
    {
      allowedRoles: ["owner", "staff"],
      legacyAllowed: true,
      salonContextRequired: true,
    }
  );

  const listQuery = runtime.queries.find(
    (query) => query.table === "visits" && query.eq.some(([field]) => field === "visit_date")
  );
  assert.deepEqual(listQuery.eq, [
    ["salon_id", "salon-1"],
    ["visit_date", "2099-10-02"],
  ]);
  const salonQuery = runtime.queries.find((query) => query.table === "salons");
  const customerQuery = runtime.queries.find((query) => query.table === "customers");
  assert.deepEqual(salonQuery.eq, [["id", "salon-1"]]);
  assert.deepEqual(customerQuery.eq, [
    ["id", "customer-1"],
    ["salon_id", "salon-1"],
  ]);

  const payload = JSON.parse(runtime.lineCalls[0].options.body);
  assert.match(payload.messages[0].text, /example\.test\/review\/salon-1/);
  const retryKey = runtime.lineCalls[0].options.headers["X-Line-Retry-Key"];
  assert.match(retryKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("fails closed when the prior delivery log cannot be checked", async () => {
  const runtime = loadRoute({
    logCheck: { data: null, error: { message: "private database detail" } },
  });
  const response = await runtime.post();

  assert.equal(response.status, 200);
  assert.equal(response.body.sentCount, 0);
  assert.equal(response.body.skippedCount, 1);
  assert.match(response.body.results[0], /送信履歴を確認できない/);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.logInserts.length, 0);
});

test("does not send when the visit changed during message preparation", async () => {
  const runtime = loadRoute({
    latestVisit: { ...baseVisit, customer_id: "customer-2" },
  });
  const response = await runtime.post();

  assert.equal(response.body.sentCount, 0);
  assert.equal(response.body.skippedCount, 1);
  assert.match(response.body.results[0], /来店内容が変更/);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.logInserts.length, 0);
});

test("reuses a stable retry key and records LINE duplicate acceptance", async () => {
  const first = loadRoute({ lineResponses: [new Error("response lost")] });
  const firstResponse = await first.post();
  assert.equal(firstResponse.body.failedCount, 1);
  assert.equal(firstResponse.body.sentCount, 0);
  assert.equal(first.logInserts.length, 0);

  const second = loadRoute({
    lineResponses: [
      new MockResponse(
        { message: "The retry key has already been accepted" },
        409,
        { "x-line-accepted-request-id": "accepted-request-1" }
      ),
    ],
  });
  const secondResponse = await second.post();

  assert.equal(secondResponse.body.ok, true);
  assert.equal(secondResponse.body.sentCount, 1);
  assert.equal(secondResponse.body.recoveredCount, 1);
  assert.equal(second.logInserts.length, 1);
  assert.equal(
    first.lineCalls[0].options.headers["X-Line-Retry-Key"],
    second.lineCalls[0].options.headers["X-Line-Retry-Key"]
  );
});

test("rejects invalid dates before creating a privileged client", async () => {
  for (const body of [
    { targetDate: "2099-02-30" },
    { targetDate: "2099/10/02" },
    { targetDate: 20991002 },
  ]) {
    const runtime = loadRoute();
    const response = await runtime.post(body);

    assert.equal(response.status, 400);
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /YYYY-MM-DD/);
    assert.equal(runtime.clientCreated(), false);
    assert.equal(runtime.lineCalls.length, 0);
  }
});

test("reports an accepted send whose delivery log could not be saved", async () => {
  const runtime = loadRoute({
    logInsertError: { message: "private insert detail" },
  });
  const response = await runtime.post();

  assert.equal(response.body.ok, false);
  assert.equal(response.body.sentCount, 1);
  assert.equal(response.body.unrecordedCount, 1);
  assert.match(response.body.results[0], /受付済み・送信記録保存失敗/);
  assert.equal(runtime.lineCalls.length, 1);
});

test("stops before visit reads when the authenticated salon is missing", async () => {
  const runtime = loadRoute({
    salonResult: { data: null, error: { message: "not found" } },
  });
  const response = await runtime.post();

  assert.equal(response.status, 500);
  assert.equal(response.body.ok, false);
  assert.match(response.body.message, /店舗情報/);
  assert.equal(runtime.lineCalls.length, 0);
  assert.equal(runtime.queries.some((query) => query.table === "visits"), false);
});
