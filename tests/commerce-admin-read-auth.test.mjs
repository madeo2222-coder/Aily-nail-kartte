import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

const routes = [
  { path: "nail-tip-orders/admin", ownerOnly: false },
  { path: "inbound-nail-tip-requests/admin", ownerOnly: true },
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
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    Error,
    Promise,
    console: { error() {} },
    process: { env: {} },
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

  const response = await exports.GET();

  return {
    authOptions,
    body: await response.json(),
    clientCreated,
    source,
    status: response.status,
  };
}

for (const route of routes) {
  test(`${route.path} rejects unauthenticated reads before privileged work`, async () => {
    const result = await runUnauthenticated(route.path);

    assert.equal(result.status, 401);
    assert.equal(result.body.ok, false);
    assert.equal(result.clientCreated, false);
    assert.deepEqual(JSON.parse(JSON.stringify(result.authOptions)), {
      allowedRoles: route.ownerOnly ? ["owner"] : ["owner", "staff"],
      legacyAllowed: false,
    });
    if (route.ownerOnly) {
      assert.doesNotMatch(
        result.source,
        /\.eq\("salon_id", authentication\.principal\.salonId\)/
      );
    } else {
      assert.match(
        result.source,
        /\.eq\("salon_id", authentication\.principal\.salonId\)/
      );
    }
  });
}
