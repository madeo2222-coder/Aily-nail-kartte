import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/hpb-mail-sync/route.ts", import.meta.url),
  "utf8"
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

async function runRoute({ authenticated = true, requestBody = {}, syncResult } = {}) {
  let authOptions = null;
  let requestRead = false;
  const syncedTexts = [];
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    Error,
    Promise,
    String,
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
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async (options) => {
            authOptions = options;
            return authenticated
              ? { ok: true, principal: { authenticationMode: "legacy" } }
              : {
                  ok: false,
                  status: 401,
                  error: "スタッフ認証が必要です。",
                };
          },
        };
      }
      if (name === "@/lib/hpb-mail-sync") {
        return {
          syncHpbMailText: async (text) => {
            syncedTexts.push(text);
            return syncResult ?? {
              parsed: { source: "hpb" },
              result: { mode: "updated", reservationId: "reservation-1" },
            };
          },
        };
      }
      return require(name);
    },
  });

  const response = await exports.POST({
    async json() {
      requestRead = true;
      return requestBody;
    },
  });

  return {
    authOptions,
    body: await response.json(),
    requestRead,
    status: response.status,
    syncedTexts,
  };
}

test("manual HPB sync rejects unauthenticated access before reading the request", async () => {
  const result = await runRoute({
    authenticated: false,
    requestBody: { text: "must not be read" },
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.ok, false);
  assert.equal(result.requestRead, false);
  assert.deepEqual(result.syncedTexts, []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.authOptions)), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
});

test("manual HPB sync forwards trimmed authenticated input exactly once", async () => {
  const result = await runRoute({ requestBody: { text: "  reservation mail  " } });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(result.syncedTexts, ["reservation mail"]);
});

test("manual HPB sync rejects empty authenticated input before syncing", async () => {
  const result = await runRoute({ requestBody: { body: "   " } });

  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.deepEqual(result.syncedTexts, []);
});
