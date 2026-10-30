import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

const api = readFileSync(
  new URL("../app/api/reservations/route.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../app/customer-app/reserve/page.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261030050000_idempotent_customer_reservation_requests.sql",
    import.meta.url,
  ),
  "utf8",
);
const compiledApi = ts.transpileModule(api, {
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

  async text() {
    return typeof this.body === "string" ? this.body : JSON.stringify(this.body);
  }
}

function loadReservationCreateRoute() {
  const providerCalls = [];
  const rpcOutcomes = ["created", "already_created"];
  const exports = {};
  const supabase = {
    async rpc(name) {
      assert.equal(name, "create_customer_requested_reservation_idempotent");
      return {
        data: [{
          outcome: rpcOutcomes.shift(),
          reservation_id: "11111111-1111-4111-8111-111111111111",
        }],
        error: null,
      };
    },
  };

  vm.runInNewContext(compiledApi, {
    exports,
    Date,
    Error,
    Intl,
    Number,
    Promise,
    String,
    console: { error() {}, log() {} },
    process: {
      env: {
        RESEND_API_KEY: "resend-key",
        RESERVATION_NOTIFY_EMAIL: "staff@example.test",
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
        LINE_ADMIN_USER_ID: "line-admin",
        NEXT_PUBLIC_BASE_URL: "https://example.test",
      },
    },
    async fetch(url, options) {
      providerCalls.push({ url, options });
      const attempt = Math.ceil(providerCalls.length / 2);
      if (url === "https://api.resend.com/emails" && attempt === 1) {
        return new MockResponse("temporary failure", 503);
      }
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
      if (name === "@/lib/server/requireCustomerLineSession") {
        return {
          getSupabaseAdmin: () => supabase,
          requireCustomerLineSession: async () => ({
            id: "customer-1",
            salonId: "salon-1",
            name: "テスト顧客",
          }),
        };
      }
      if (name === "@/lib/server/customerReservationAvailability") {
        return {
          getCustomerReservationAvailability: async () => ({
            slots: [{ time: "10:00", staffIds: ["staff-1"] }],
            staffs: [{ id: "staff-1", name: "テスト担当" }],
          }),
          isValidCustomerBookingDate: () => true,
          normalizeCustomerBookingDuration: value => Number(value),
          resolveCustomerBookingSalonId: async () => "salon-1",
        };
      }
      if (name === "@/lib/customer-reservation-submission") {
        return { isCustomerReservationOperationId: () => true };
      }
      return require(name);
    },
  });

  const request = {
    async json() {
      return {
        menu: "ワンカラー",
        date: "2099-10-01",
        time: "10:00",
        staffId: "staff-1",
        durationMinutes: 60,
        memo: "",
        operationId: "11111111-1111-4111-8111-111111111111",
      };
    },
  };

  return { post: () => exports.POST(request), providerCalls };
}

test("customer booking page persists one operation ID until a known result", () => {
  assert.match(page, /buildCustomerReservationFingerprint\(submission\)/);
  assert.match(
    page,
    /getOrCreateCustomerReservationOperationId\([\s\S]{0,180}crypto\.randomUUID\(\)/,
  );
  assert.match(page, /JSON\.stringify\(\{ \.\.\.submission, operationId \}\)/);
  assert.match(
    page,
    /if \(!json\)[\s\S]{0,300}setReservationResultUnknown\(true\)/,
  );
  assert.match(
    page,
    /if \(!response\.ok \|\| !json\.ok\)[\s\S]{0,900}clearCustomerReservationOperation/,
  );
});

test("customer booking API uses the idempotent RPC with a safe legacy fallback", () => {
  assert.match(api, /create_customer_requested_reservation_idempotent/);
  assert.match(api, /p_operation_id: operationId/);
  assert.match(api, /isMissingIdempotentCreateRpc\(error\)/);
  assert.match(api, /create_customer_requested_reservation",/);
  assert.match(api, /\["created", "already_created"\]/);
  assert.match(
    api,
    /excludeReservationId: requestedOperationId \|\| undefined/,
  );
  assert.match(
    api,
    /sendReservationNoticeMail\(\{[\s\S]{0,100}reservationId/,
  );
  assert.match(
    api,
    /alreadyCreated: writeResult\.outcome === "already_created" \|\| undefined/,
  );
});

test("customer booking notification retries reuse provider idempotency keys", () => {
  assert.match(
    api,
    /"Idempotency-Key": `customer-reservation-request-\$\{reservationId\}`/,
  );
  assert.match(
    api,
    /"X-Line-Retry-Key": createReservationNoticeLineRetryKey\(reservationId\)/,
  );
  assert.match(
    api,
    /createHash\("sha256"\)[\s\S]{0,180}customer-reservation-request/,
  );
  assert.match(api, /Promise\.allSettled\(\[/);
  assert.match(
    api,
    /notificationFailed[\s\S]{0,600}notificationRetryable: true/,
  );
  assert.match(
    page,
    /json\.reservationSaved && json\.notificationRetryable/,
  );
  assert.match(page, /店舗への通知を再試行/);
});

test("a known provider failure preserves the reservation and retries only its notices", async () => {
  const route = loadReservationCreateRoute();

  const failedNotice = await route.post();
  assert.equal(failedNotice.status, 503);
  assert.equal(failedNotice.body.reservationSaved, true);
  assert.equal(failedNotice.body.notificationRetryable, true);
  assert.equal(failedNotice.body.reservationId, "11111111-1111-4111-8111-111111111111");

  const retriedNotice = await route.post();
  assert.equal(retriedNotice.status, 200);
  assert.equal(retriedNotice.body.ok, true);
  assert.equal(retriedNotice.body.alreadyCreated, true);

  const mailCalls = route.providerCalls.filter(
    call => call.url === "https://api.resend.com/emails",
  );
  const lineCalls = route.providerCalls.filter(
    call => call.url === "https://api.line.me/v2/bot/message/push",
  );
  assert.equal(mailCalls.length, 2);
  assert.equal(lineCalls.length, 2);
  assert.equal(
    mailCalls[0].options.headers["Idempotency-Key"],
    mailCalls[1].options.headers["Idempotency-Key"],
  );
  assert.equal(
    lineCalls[0].options.headers["X-Line-Retry-Key"],
    lineCalls[1].options.headers["X-Line-Retry-Key"],
  );
});

test("idempotent customer booking RPC serializes writes and stays service-role-only", () => {
  assert.match(migration, /lock table public\.reservations in share row exclusive mode/);
  assert.match(migration, /where reservation\.id = p_operation_id/);
  assert.match(migration, /select 'already_created'::text/);
  assert.match(migration, /select 'idempotency_conflict'::text/);
  assert.match(migration, /reservation\.customer_id = p_customer_id/);
  assert.match(migration, /select 'customer_unavailable'::text/);
  assert.match(migration, /values \([\s\S]*p_operation_id/);
  assert.match(
    migration,
    /revoke all on function public\.create_customer_requested_reservation_idempotent\([\s\S]*\) from anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_customer_requested_reservation_idempotent\([\s\S]*\) to service_role/,
  );
});
