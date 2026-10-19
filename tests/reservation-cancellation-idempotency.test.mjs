import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/reservations/[id]/cancel/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
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

function loadRoute(status) {
  const calls = [];
  let updateCalled = false;
  let fetchCalled = false;

  const readQuery = {
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          id: "reservation-1",
          salon_id: "salon-1",
          customer_id: "customer-1",
          start_at: "2099-10-02T01:30:00.000Z",
          status,
        },
        error: null,
      };
    },
    update() {
      updateCalled = true;
      return this;
    },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    AbortController,
    Array,
    Date,
    Error,
    Intl,
    Object,
    Promise,
    Set,
    String,
    clearTimeout,
    fetch() {
      fetchCalled = true;
      throw new Error("LINE should not be called");
    },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
      },
    },
    require(name) {
      if (name === "next/server") {
        return {
          NextRequest: class {},
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
            return { from: () => readQuery };
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
    setTimeout,
  });

  return {
    async post() {
      const response = await exports.POST(
        {
          async json() {
            return { sendLine: true, reason: "customer_request" };
          },
        },
        { params: Promise.resolve({ id: "reservation-1" }) },
      );
      return { body: await response.json(), status: response.status };
    },
    get fetchCalled() {
      return fetchCalled;
    },
    get updateCalled() {
      return updateCalled;
    },
  };
}

test("every supported cancelled status is idempotent and does not resend LINE", async () => {
  for (const status of [
    "キャンセル",
    "cancelled",
    "canceled",
    "cancel",
    "取消",
    "取り消し",
    " CANCELLED ",
  ]) {
    const runtime = loadRoute(status);
    const response = await runtime.post();

    assert.equal(response.status, 200, status);
    assert.equal(response.body.ok, true, status);
    assert.equal(response.body.cancelled, false, status);
    assert.equal(response.body.alreadyCancelled, true, status);
    assert.equal(response.body.line.status, "skipped", status);
    assert.match(response.body.line.message, /LINEは再送していません/, status);
    assert.equal(runtime.updateCalled, false, status);
    assert.equal(runtime.fetchCalled, false, status);
  }
});
