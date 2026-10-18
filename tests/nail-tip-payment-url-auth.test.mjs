import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL(
    "../app/api/nail-tip-orders/[id]/payment-url/route.ts",
    import.meta.url
  ),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const orderId = "123e4567-e89b-42d3-a456-426614174000";

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

async function runRoute({ orderResult }) {
  const eqs = [];
  let rpcCalled = false;
  const supabase = {
    from(table) {
      assert.equal(table, "nail_tip_orders");
      const chain = {
        select() {
          return chain;
        },
        eq(column, value) {
          eqs.push([column, value]);
          return chain;
        },
        single() {
          return Promise.resolve(orderResult);
        },
      };
      return chain;
    },
    rpc(name, values) {
      rpcCalled = true;
      assert.equal(name, "prepare_nail_tip_order_payment_link");
      assert.equal(values.p_nail_tip_order_id, orderId);
      return Promise.resolve({ data: orderId, error: null });
    },
  };
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    Date,
    Error,
    Promise,
    URL,
    encodeURIComponent,
    console: { error() {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_APP_URL: "https://example.test",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
        VERITRANS_DUMMY: "1",
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
        return { createClient: () => supabase };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async () => ({
            ok: true,
            principal: {
              salonId: "salon-1",
              role: "owner",
            },
          }),
        };
      }
      return require(name);
    },
  });

  const response = await exports.POST(
    {},
    { params: Promise.resolve({ id: orderId }) }
  );

  return {
    body: await response.json(),
    eqs,
    rpcCalled,
    status: response.status,
  };
}

test("payment URL preparation rejects an order outside the staff salon before RPC", async () => {
  const result = await runRoute({
    orderResult: { data: null, error: { code: "PGRST116" } },
  });

  assert.equal(result.status, 404);
  assert.equal(result.body.ok, false);
  assert.equal(result.rpcCalled, false);
  assert.deepEqual(result.eqs, [
    ["id", orderId],
    ["salon_id", "salon-1"],
  ]);
});

test("payment URL preparation reaches the RPC only for the staff salon order", async () => {
  const result = await runRoute({
    orderResult: { data: { id: orderId }, error: null },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.rpcCalled, true);
  assert.deepEqual(result.eqs, [
    ["id", orderId],
    ["salon_id", "salon-1"],
  ]);
});
