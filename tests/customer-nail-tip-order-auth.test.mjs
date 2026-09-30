import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

function loadRoute(routePath, { customer, getSupabaseAdmin }) {
  const source = readFileSync(
    new URL(`../app/api/${routePath}/route.ts`, import.meta.url),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    Error,
    Promise,
    String,
    console: { error() {}, log() {} },
    fetch: async () => {
      throw new Error("internal identity fetch must not run");
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
          requireCustomerLineSession: async () => customer,
          getSupabaseAdmin,
        };
      }
      if (name === "@/lib/nail-tip-products/catalog") {
        return {
          getNailTipProduct(code) {
            return code === "ruby_love"
              ? { code, name: "Ruby", startingPrice: 10_000, stone: "Ruby", fortune: "Love" }
              : null;
          },
        };
      }
      return require(name);
    },
  });

  return { exports, source };
}

test("customer nail-tip creation rejects an unsigned session before reading the body", async () => {
  let bodyRead = false;
  let adminClientCreated = false;
  const runtime = loadRoute("nail-tip-orders", {
    customer: null,
    getSupabaseAdmin() {
      adminClientCreated = true;
      throw new Error("service role must not be used");
    },
  });

  const response = await runtime.exports.POST({
    async json() {
      bodyRead = true;
      throw new Error("body must not be read");
    },
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).ok, false);
  assert.equal(bodyRead, false);
  assert.equal(adminClientCreated, false);
});

test("customer nail-tip creation derives customer and salon identity from the signed session", async () => {
  let inserted = null;
  const runtime = loadRoute("nail-tip-orders", {
    customer: {
      id: "trusted-customer",
      name: "Customer",
      salonId: "trusted-salon",
    },
    getSupabaseAdmin() {
      return {
        from(table) {
          assert.equal(table, "nail_tip_orders");
          return {
            insert(payload) {
              inserted = payload;
              return {
                select() {
                  return {
                    async single() {
                      return { data: { id: "order-1" }, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  });

  const response = await runtime.exports.POST({
    async json() {
      return {
        customerId: "spoofed-customer",
        salonId: "spoofed-salon",
        luckyColor: "red",
        luckyStone: "ruby",
        nailTheme: "love",
        productCode: "ruby_love",
        designRequest: "request",
        sizeStatus: "measured",
        deliveryRequest: "delivery",
      };
    },
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).orderId, "order-1");
  assert.equal(inserted.customer_id, "trusted-customer");
  assert.equal(inserted.salon_id, "trusted-salon");
  assert.notEqual(inserted.customer_id, "spoofed-customer");
  assert.notEqual(inserted.salon_id, "spoofed-salon");
});

test("customer nail-tip history uses the shared signed session instead of an internal HTTP identity call", async () => {
  let adminClientCreated = false;
  const runtime = loadRoute("customer-app/nail-tip-orders", {
    customer: null,
    getSupabaseAdmin() {
      adminClientCreated = true;
      throw new Error("service role must not be used");
    },
  });

  const response = await runtime.exports.GET({});

  assert.equal(response.status, 401);
  assert.equal((await response.json()).ok, false);
  assert.equal(adminClientCreated, false);
  assert.match(runtime.source, /requireCustomerLineSession/);
  assert.doesNotMatch(runtime.source, /NEXT_PUBLIC_APP_URL/);
  assert.doesNotMatch(runtime.source, /\/api\/line-login\/me/);
});

test("the customer order page no longer submits client-controlled identity fields", () => {
  const source = readFileSync(
    new URL("../app/customer-app/nail-tip-order/page.tsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /customerId/);
  assert.doesNotMatch(source, /salonId/);
  assert.doesNotMatch(source, /\/api\/line-login\/me/);
});
