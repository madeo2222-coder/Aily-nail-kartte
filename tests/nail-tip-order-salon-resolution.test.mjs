import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(
  new URL("../app/api/nail-tip-orders/route.ts", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

function fixture({
  customer = { id: "customer-1", salonId: null },
  resolvedSalonId = "salon-1",
  resolutionError = false,
} = {}) {
  const inserts = [];
  const lookupArguments = [];
  const supabase = {
    from(table) {
      assert.equal(table, "nail_tip_orders");
      return {
        insert(data) {
          inserts.push(data);
          return {
            select(column) {
              assert.equal(column, "id");
              return {
                single: async () => ({ data: { id: "order-1" }, error: null }),
              };
            },
          };
        },
      };
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "next/server")
        return {
          NextResponse: {
            json(body, options = {}) {
              return { body, status: options.status ?? 200 };
            },
          },
        };
      if (name === "@/lib/nail-tip-products/catalog")
        return {
          getNailTipProduct: () => ({
            code: "demo",
            name: "Demo Nail",
            startingPrice: 1000,
            stone: "Quartz",
            fortune: "Good",
          }),
        };
      if (name === "@/lib/server/requireCustomerLineSession")
        return {
          requireCustomerLineSession: async () => customer,
          getSupabaseAdmin: () => supabase,
        };
      if (name === "@/lib/server/customerReservationAvailability")
        return {
          resolveCustomerBookingSalonId: async (client, salonId) => {
            assert.equal(client, supabase);
            lookupArguments.push(salonId);
            if (resolutionError) throw new Error("Salon lookup failed.");
            return resolvedSalonId;
          },
        };
      throw new Error("Unexpected import: " + name);
    },
  });
  return {
    inserts,
    lookupArguments,
    request: () =>
      exports.POST({
        json: async () => ({ productCode: "demo" }),
      }),
  };
}

test("unassigned LINE customer can submit when a single salon resolves", async () => {
  const t = fixture();
  const result = await t.request();
  assert.equal(result.status, 200);
  assert.equal(result.body.orderId, "order-1");
  assert.deepEqual(t.lookupArguments, [null]);
  assert.equal(t.inserts.length, 1);
  assert.equal(t.inserts[0].salon_id, "salon-1");
  assert.equal(t.inserts[0].customer_id, "customer-1");
});

test("already-linked customer keeps its salon", async () => {
  const t = fixture({
    customer: { id: "customer-1", salonId: "salon-2" },
    resolvedSalonId: "salon-2",
  });
  const result = await t.request();
  assert.equal(result.status, 200);
  assert.deepEqual(t.lookupArguments, ["salon-2"]);
  assert.equal(t.inserts[0].salon_id, "salon-2");
});

test("ambiguous or absent salon fails without creating an order", async () => {
  const t = fixture({ resolvedSalonId: null });
  const result = await t.request();
  assert.equal(result.status, 409);
  assert.match(result.body.error, /店舗/);
  assert.equal(t.inserts.length, 0);
});

test("salon lookup errors never create an order", async () => {
  const t = fixture({ resolutionError: true });
  const result = await t.request();
  assert.equal(result.status, 500);
  assert.equal(t.inserts.length, 0);
});

test("anonymous customer cannot resolve a salon or insert an order", async () => {
  const t = fixture({ customer: null });
  const result = await t.request();
  assert.equal(result.status, 401);
  assert.equal(t.inserts.length, 0);
  assert.equal(t.lookupArguments.length, 0);
});
