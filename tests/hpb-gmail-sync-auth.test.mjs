import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/hpb-gmail-sync/route.ts", import.meta.url),
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

function loadRoute({
  authenticated = true,
  authenticationMode = "supabase",
  nodeEnv = "production",
  listPages = [{ messages: [] }],
} = {}) {
  const authOptions = [];
  let oauthClientCount = 0;
  const gmailListCalls = [];
  const syncedTexts = [];
  const exports = {};

  class MockOAuth2 {
    constructor() {
      oauthClientCount += 1;
    }

    setCredentials() {}
  }

  vm.runInNewContext(compiled, {
    exports,
    Buffer,
    Error,
    Promise,
    String,
    process: {
      env: {
        CRON_SECRET: "cron-secret",
        GOOGLE_GMAIL_CLIENT_ID: "client-id",
        GOOGLE_GMAIL_CLIENT_SECRET: "client-secret",
        GOOGLE_GMAIL_REDIRECT_URI: "https://example.com/callback",
        GOOGLE_GMAIL_REFRESH_TOKEN: "refresh-token",
        NODE_ENV: nodeEnv,
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
      if (name === "googleapis") {
        return {
          google: {
            auth: { OAuth2: MockOAuth2 },
            gmail() {
              return {
                users: {
                  messages: {
                    async list(parameters) {
                      const page = listPages[gmailListCalls.length] || {
                        messages: [],
                      };
                      gmailListCalls.push(parameters);
                      return { data: page };
                    },
                    async get({ id }) {
                      return {
                        data: {
                          payload: {
                            mimeType: "text/plain",
                            headers: [
                              {
                                name: "Subject",
                                value: "HOT PEPPER Beauty 予約番号",
                              },
                            ],
                            body: {
                              data: Buffer.from(id).toString("base64url"),
                            },
                          },
                        },
                      };
                    },
                  },
                },
              };
            },
          },
        };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async (options) => {
            authOptions.push(options);
            return authenticated
              ? {
                  ok: true,
                  principal: { authenticationMode },
                }
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
            return {};
          },
        };
      }
      if (name === "@/lib/hpb-gmail-sync-summary") {
        return {
          summarizeGmailSyncResults(results) {
            return {
              processedCount: results.length,
              syncedCount: 0,
              skippedCount: 0,
              failedCount: 0,
            };
          },
        };
      }
      return require(name);
    },
  });

  return {
    authOptions,
    exports,
    get gmailListCount() {
      return gmailListCalls.length;
    },
    get gmailListCalls() {
      return gmailListCalls;
    },
    get syncedTexts() {
      return syncedTexts;
    },
    get oauthClientCount() {
      return oauthClientCount;
    },
  };
}

test("manual Gmail sync rejects unauthenticated access before Gmail OAuth", async () => {
  const runtime = loadRoute({ authenticated: false });
  const response = await runtime.exports.POST();

  assert.equal(response.status, 401);
  assert.equal((await response.json()).ok, false);
  assert.equal(runtime.oauthClientCount, 0);
  assert.equal(runtime.gmailListCount, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions[0])), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
});

for (const authenticationMode of ["supabase", "legacy"]) {
  test(`manual Gmail sync accepts ${authenticationMode} staff authentication`, async () => {
    const runtime = loadRoute({ authenticationMode });
    const response = await runtime.exports.POST();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.count, 0);
    assert.equal(runtime.oauthClientCount, 1);
    assert.equal(runtime.gmailListCount, 1);
  });
}

test("cron Gmail sync remains bearer-only in production", async () => {
  const runtime = loadRoute();
  const response = await runtime.exports.GET({
    headers: { get: () => null },
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Unauthorized");
  assert.equal(runtime.authOptions.length, 0);
  assert.equal(runtime.oauthClientCount, 0);
});

test("cron Gmail sync accepts the configured bearer token", async () => {
  const runtime = loadRoute();
  const response = await runtime.exports.GET({
    headers: { get: () => "Bearer cron-secret" },
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(runtime.authOptions.length, 0);
  assert.equal(runtime.gmailListCount, 1);
});

test("Gmail sync follows every result page and processes oldest mail first", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [{ id: "newer-message" }],
        nextPageToken: "page-2",
      },
      {
        messages: [{ id: "older-message" }],
      },
    ],
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.equal(runtime.gmailListCount, 2);
  assert.equal(runtime.gmailListCalls[0].maxResults, 100);
  assert.equal(runtime.gmailListCalls[0].pageToken, undefined);
  assert.equal(runtime.gmailListCalls[1].pageToken, "page-2");
  assert.deepEqual(runtime.syncedTexts, ["older-message", "newer-message"]);
});
