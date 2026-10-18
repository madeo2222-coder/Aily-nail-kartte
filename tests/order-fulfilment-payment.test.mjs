import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server.js";

function setup(action, {
  payment = "payment_waiting",
  status = "requested",
  stale = false,
  salon = "salon-1",
  customer = false,
  shippingCompany = null,
  trackingNumber = null,
  shippedAt = null,
  lineStatus = 200,
} = {}) {
  const updates = []; const filters = []; const calls = []; const authCalls = []; const externalCalls = [];
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    salon_id: salon,
    customer_id: customer ? "customer-1" : null,
    status,
    payment_status: payment,
    shipping_company: shippingCompany,
    tracking_number: trackingNumber,
    shipped_at: shippedAt,
  };
  const supabase = { from(table) {
    calls.push(table); let updating = false; const localFilters = [];
    const query = {
      select() { return query; },
      eq(field, value) { localFilters.push([field, value]); filters.push([field, value]); return query; },
      is(field, value) { return query.eq(field, value); },
      update(value) { updating = true; updates.push(value); return query; },
      async maybeSingle() {
        if (updating) return { data: stale ? null : { id: row.id }, error: null };
        if (localFilters.some(([field, value]) => field === "salon_id" && value !== salon)) {
          return { data: null, error: null };
        }
        if (table === "customers") {
          return {
            data: customer
              ? { id: "customer-1", salon_id: salon, name: "Fixture", line_user_id: "line-user-1" }
              : null,
            error: null,
          };
        }
        return { data: row, error: null };
      },
      async single() { return query.maybeSingle(); },
    };
    return query;
  } };
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL(`../app/api/nail-tip-orders/[id]/${action}/route.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture-only", LINE_CHANNEL_ACCESS_TOKEN: "fixture-line-token" } }, console: { error() {} },
    async fetch(url, options) {
      externalCalls.push({ url, options });
      return new Response(lineStatus === 409 ? "duplicate" : "{}", { status: lineStatus });
    },
    require(name) {
      if (name === "next/server") return { NextResponse };
      if (name === "@supabase/supabase-js") return { createClient: () => supabase };
      if (name === "@/lib/server/staffApiAuthentication") return { authenticateStaffApi: async options => {
        authCalls.push(options);
        return { ok: true, principal: { salonId: "salon-1" } };
      } };
      throw new Error(`unexpected module ${name}`);
    },
  });
  return { authCalls, updates, filters, externalCalls, async run(body = {}) { return exports.POST(new Request("https://example.test/action", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: row.id }) }); } };
}
test("staff cannot mark an unpaid order paid, making, shipped, or completed", async () => {
  for (const status of ["paid", "making", "shipped", "completed"]) {
    const app = setup("status"); assert.equal((await app.run({ status })).status, 409); assert.equal(app.updates.length, 0);
  }
});
test("verified payment can begin making, without writing the payment result", async () => {
  const app = setup("status", { payment: "paid" });
  assert.equal((await app.run({ status: "making" })).status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(app.authCalls)), [{ allowedRoles: ["owner", "staff"], legacyAllowed: false }]);
  assert.deepEqual(JSON.parse(JSON.stringify(app.updates)), [{ status: "making" }]);
  assert.ok(app.filters.some(([key, value]) => key === "payment_status" && value === "paid"));
  assert.ok(app.filters.some(([key, value]) => key === "salon_id" && value === "salon-1"));
});
test("shipping requires the dedicated shipping form and completion requires shipment", async () => {
  for (const status of ["shipped", "completed"]) {
    const app = setup("status", { payment: "paid", status: "making" });
    assert.equal((await app.run({ status })).status, 409); assert.equal(app.updates.length, 0);
  }
});
test("another salon and stale status updates cannot report success", async () => {
  const other = setup("status", { salon: "salon-2", payment: "paid" });
  assert.equal((await other.run({ status: "making" })).status, 404); assert.equal(other.updates.length, 0);
  const stale = setup("status", { payment: "paid", stale: true });
  assert.equal((await stale.run({ status: "making" })).status, 409);
});
const shipping = { shippingCompany: "Fixture carrier", trackingNumber: "fixture-tracking" };
test("shipping rejects unpaid, cancelled, or completed orders before writes and notifications", async () => {
  for (const options of [{}, { payment: "paid", status: "cancelled" }, { payment: "paid", status: "completed" }]) {
    const app = setup("shipping", options); assert.equal((await app.run(shipping)).status, 409); assert.equal(app.updates.length, 0);
  }
});
test("shipping saves paid orders and detects stale or other-salon requests", async () => {
  const app = setup("shipping", { payment: "paid", status: "making" });
  assert.equal((await app.run(shipping)).status, 200);
  assert.equal(app.updates[0].status, "shipped");
  assert.ok(app.filters.some(([key, value]) => key === "payment_status" && value === "paid"));
  assert.equal((await setup("shipping", { payment: "paid", stale: true }).run(shipping)).status, 409);
  assert.equal((await setup("shipping", { payment: "paid", salon: "salon-2" }).run(shipping)).status, 404);
});
test("shipping notification retries use one LINE retry key and keep customer lookup salon-scoped", async () => {
  const app = setup("shipping", {
    payment: "paid",
    status: "shipped",
    customer: true,
    shippingCompany: shipping.shippingCompany,
    trackingNumber: shipping.trackingNumber,
    shippedAt: new Date().toISOString(),
    lineStatus: 409,
  });

  const response = await app.run(shipping);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.lineSent, true);
  assert.equal(app.updates.length, 0);
  assert.equal(app.externalCalls.length, 1);
  assert.equal(
    app.externalCalls[0].options.headers["X-Line-Retry-Key"],
    "11111111-1111-4111-8111-111111111111"
  );
  assert.ok(app.filters.some(([key, value]) => key === "salon_id" && value === "salon-1"));
});
test("shipping does not silently change shipped parcels or retry LINE after 24 hours", async () => {
  const previous = {
    payment: "paid",
    status: "shipped",
    customer: true,
    shippingCompany: shipping.shippingCompany,
    trackingNumber: shipping.trackingNumber,
  };

  const changed = setup("shipping", {
    ...previous,
    shippedAt: new Date().toISOString(),
  });
  assert.equal(
    (await changed.run({ ...shipping, trackingNumber: "different" })).status,
    409
  );
  assert.equal(changed.updates.length, 0);
  assert.equal(changed.externalCalls.length, 0);

  const expired = setup("shipping", {
    ...previous,
    shippedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  });
  const response = await expired.run(shipping);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.lineSent, false);
  assert.equal(expired.updates.length, 0);
  assert.equal(expired.externalCalls.length, 0);
});
