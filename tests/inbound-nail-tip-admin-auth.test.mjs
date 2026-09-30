import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routes = [
  {
    name: "inbound status",
    path: "inbound-nail-tip-requests/[id]/status",
  },
  {
    name: "inbound mark-paid",
    path: "inbound-nail-tip-requests/[id]/mark-paid",
  },
  {
    name: "inbound complete",
    path: "inbound-nail-tip-requests/[id]/complete",
  },
  {
    name: "inbound start-making",
    path: "inbound-nail-tip-requests/[id]/start-making",
  },
  {
    name: "inbound quote",
    path: "inbound-nail-tip-requests/[id]/quote",
  },
  {
    name: "inbound shipping",
    path: "inbound-nail-tip-requests/[id]/shipping",
  },
  {
    name: "inbound send-quote",
    path: "inbound-nail-tip-requests/[id]/send-quote",
  },
  {
    name: "inbound payment-url",
    path: "inbound-nail-tip-requests/[id]/payment-url",
  },
  { name: "domestic status", path: "nail-tip-orders/[id]/status" },
  { name: "domestic payment", path: "nail-tip-orders/[id]/payment" },
  { name: "domestic shipping", path: "nail-tip-orders/[id]/shipping" },
];

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

async function runUnauthenticated(routePath) {
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
  let authOptions = null;
  let clientCreated = false;
  let externalFetchCalled = false;

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    Number,
    Promise,
    String,
    console: { error() {}, log() {} },
    fetch: async () => {
      externalFetchCalled = true;
      throw new Error("external fetch must not run");
    },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
        RESEND_API_KEY: "resend-test",
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
        return {
          createClient() {
            clientCreated = true;
            throw new Error("service role must not be created");
          },
        };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async (options) => {
            authOptions = options;
            return {
              ok: false,
              status: 401,
              error: "スタッフ認証が必要です。",
            };
          },
        };
      }
      return require(name);
    },
  });

  const response = await exports.POST(
    {
      json: async () => {
        throw new Error("request body must not be read");
      },
    },
    {
      params: {
        then() {
          throw new Error("params must not be read");
        },
      },
    }
  );

  return {
    authOptions,
    body: await response.json(),
    clientCreated,
    externalFetchCalled,
    status: response.status,
  };
}

for (const route of routes) {
  test(`${route.name} rejects unauthenticated writes before privileged work`, async () => {
    const result = await runUnauthenticated(route.path);

    assert.equal(result.status, 401);
    assert.equal(result.body.ok, false);
    assert.equal(result.clientCreated, false);
    assert.equal(result.externalFetchCalled, false);
    assert.deepEqual(JSON.parse(JSON.stringify(result.authOptions)), {
      allowedRoles: ["owner", "staff"],
      legacyAllowed: true,
      salonContextRequired: false,
    });
  });
}
