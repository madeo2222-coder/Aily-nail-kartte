import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routes = [
  {
    name: "Google review LINE",
    path: "send-google-review-line",
    methods: ["POST", "GET"],
  },
  {
    name: "reservation confirmation email",
    path: "send-reservation-confirmed-email",
    methods: ["POST"],
  },
  {
    name: "reservation confirmation LINE",
    path: "send-reservation-confirmed-line",
    methods: ["POST"],
  },
  {
    name: "reservation reminder LINE",
    path: "send-reservation-reminder-line",
    methods: ["POST", "GET"],
  },
  {
    name: "visit review request LINE",
    path: "send-review-request-line",
    methods: ["POST", "GET"],
  },
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

async function runUnauthenticated(routePath, method) {
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
  let requestRead = false;
  let resendCreated = false;

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Error,
    Number,
    Promise,
    String,
    URL,
    console: { error() {}, log() {} },
    fetch: async () => {
      externalFetchCalled = true;
      throw new Error("external fetch must not run");
    },
    process: {
      env: {
        LINE_CHANNEL_ACCESS_TOKEN: "line-test",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        RESEND_API_KEY: "resend-test",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
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
      if (name === "resend") {
        return {
          Resend: class {
            constructor() {
              resendCreated = true;
              throw new Error("Resend must not be created");
            }
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

  const request = {
    get url() {
      requestRead = true;
      throw new Error("request URL must not be read");
    },
    async json() {
      requestRead = true;
      throw new Error("request body must not be read");
    },
  };
  const response = await exports[method](request);

  return {
    authOptions,
    body: await response.json(),
    clientCreated,
    externalFetchCalled,
    requestRead,
    resendCreated,
    status: response.status,
  };
}

for (const route of routes) {
  for (const method of route.methods) {
    test(`${route.name} ${method} rejects unauthenticated sends before privileged work`, async () => {
      const result = await runUnauthenticated(route.path, method);

      assert.equal(result.status, 401);
      assert.equal(result.body.ok, false);
      assert.equal(result.clientCreated, false);
      assert.equal(result.externalFetchCalled, false);
      assert.equal(result.requestRead, false);
      assert.equal(result.resendCreated, false);
      assert.deepEqual(JSON.parse(JSON.stringify(result.authOptions)), {
        allowedRoles: ["owner", "staff"],
        legacyAllowed: true,
        salonContextRequired: false,
      });
    });
  }
}
