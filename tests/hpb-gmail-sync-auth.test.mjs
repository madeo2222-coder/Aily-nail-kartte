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
  syncFailures = [],
  parseFailures = [],
  messageGetFailures = [],
  attachmentGetFailures = [],
  attachmentPayloads = {},
  messageInternalDates = {},
  messageResponseThreadIds = {},
  messagePayloads = {},
  messageGetDelayMs = 0,
} = {}) {
  const authOptions = [];
  let oauthClientCount = 0;
  let activeGmailGetCount = 0;
  let maxGmailGetConcurrency = 0;
  const gmailListCalls = [];
  const gmailAttachmentCalls = [];
  const syncedTexts = [];
  const syncedSubjects = [];
  const parsedTexts = [];
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
    TextDecoder,
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
                      activeGmailGetCount += 1;
                      maxGmailGetConcurrency = Math.max(
                        maxGmailGetConcurrency,
                        activeGmailGetCount
                      );
                      try {
                        if (messageGetDelayMs > 0) {
                          await new Promise((resolve) =>
                            setTimeout(resolve, messageGetDelayMs)
                          );
                        }
                        if (messageGetFailures.includes(id)) {
                          throw new Error(`get failed: ${id}`);
                        }
                        return {
                          data: {
                            threadId: Object.hasOwn(messageResponseThreadIds, id)
                              ? messageResponseThreadIds[id]
                              : undefined,
                            internalDate: Object.hasOwn(messageInternalDates, id)
                              ? messageInternalDates[id]
                              : "0",
                            payload: messagePayloads[id] ?? {
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
                      } finally {
                        activeGmailGetCount -= 1;
                      }
                    },
                    attachments: {
                      async get({ messageId, id }) {
                        gmailAttachmentCalls.push({ messageId, id });
                        if (attachmentGetFailures.includes(id)) {
                          throw new Error(`attachment get failed: ${id}`);
                        }
                        return {
                          data: {
                            data: attachmentPayloads[id] ?? null,
                          },
                        };
                      },
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
          parseHpbMailText: (text) => {
            parsedTexts.push(text);
            if (parseFailures.includes(text)) {
              throw new Error(`parse failed: ${text}`);
            }
            return { source: "hpb" };
          },
          syncHpbMailText: async (text, subject) => {
            syncedTexts.push(text);
            syncedSubjects.push(subject);
            if (syncFailures.includes(text)) {
              throw new Error(`sync failed: ${text}`);
            }
            return {
              parsed: { source: "hpb" },
              result: { mode: "updated" },
            };
          },
        };
      }
      if (name === "@/lib/hpb-gmail-sync-summary") {
        return {
          summarizeGmailSyncResults(results) {
            const skippedCount = results.filter((result) => result.skipped).length;
            const syncedCount = results.filter(
              (result) => !result.skipped && result.ok
            ).length;
            return {
              processedCount: results.length,
              syncedCount,
              skippedCount,
              failedCount: results.length - skippedCount - syncedCount,
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
    get gmailAttachmentCalls() {
      return gmailAttachmentCalls;
    },
    get syncedTexts() {
      return syncedTexts;
    },
    get syncedSubjects() {
      return syncedSubjects;
    },
    get parsedTexts() {
      return parsedTexts;
    },
    get oauthClientCount() {
      return oauthClientCount;
    },
    get maxGmailGetConcurrency() {
      return maxGmailGetConcurrency;
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
  assert.deepEqual(runtime.syncedSubjects, [
    "HOT PEPPER Beauty 予約番号",
    "HOT PEPPER Beauty 予約番号",
  ]);
});

test("Gmail sync uses each message timestamp when search order is misleading", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [{ id: "older-message" }, { id: "newer-message" }],
      },
    ],
    messageInternalDates: {
      "older-message": "1000",
      "newer-message": "2000",
    },
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.deepEqual(runtime.syncedTexts, ["older-message", "newer-message"]);
});

test("Gmail sync decodes an RFC 2047 base64 subject before cancellation parsing", async () => {
  const subject = "ご予約のキャンセル SALON BOARD";
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "encoded-subject", threadId: "thread-1" }] }],
    messagePayloads: {
      "encoded-subject": {
        mimeType: "text/plain",
        headers: [
          {
            name: "Subject",
            value: `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
          },
        ],
        body: {
          data: Buffer.from("予約番号：A123456").toString("base64url"),
        },
      },
    },
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.deepEqual(runtime.syncedSubjects, [subject]);
});

test("Gmail sync joins adjacent RFC 2047 quoted-printable subject words", async () => {
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "q-subject", threadId: "thread-1" }] }],
    messagePayloads: {
      "q-subject": {
        mimeType: "text/plain",
        headers: [
          {
            name: "Subject",
            value:
              "=?UTF-8?Q?=E3=81=94=E4=BA=88=E7=B4=84=E3=81=AE?= =?UTF-8?Q?=E3=82=AD=E3=83=A3=E3=83=B3=E3=82=BB=E3=83=AB?= SALON BOARD",
          },
        ],
        body: {
          data: Buffer.from("予約番号：A123456").toString("base64url"),
        },
      },
    },
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.deepEqual(runtime.syncedSubjects, ["ご予約のキャンセル SALON BOARD"]);
});

test("Gmail sync fails closed when an encoded subject charset is unsupported", async () => {
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "bad-subject", threadId: "thread-1" }] }],
    messagePayloads: {
      "bad-subject": {
        mimeType: "text/plain",
        headers: [
          {
            name: "Subject",
            value: "=?x-private-mail?B?U0FMT04gQk9BUkQ=?=",
          },
        ],
        body: {
          data: Buffer.from("予約番号：A123456").toString("base64url"),
        },
      },
    },
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.failedCount, 1);
  assert.match(body.results[0].error, /メール件名の文字コードを読み取れませんでした/);
  assert.doesNotMatch(body.results[0].error, /x-private-mail/);
  assert.deepEqual(runtime.syncedTexts, []);
});

test("Gmail sync preserves field boundaries in an HTML-only reservation mail", async () => {
  const html = `<div>予約番号：A123456</div><div>氏名：テスト顧客</div><div>来店日時：2099年10月20日 10:00</div>`;
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "html-only" }] }],
    messagePayloads: {
      "html-only": {
        mimeType: "text/html",
        headers: [{ name: "Subject", value: "SALON BOARD予約" }],
        body: { data: Buffer.from(html).toString("base64url") },
      },
    },
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.equal(
    runtime.syncedTexts[0],
    "予約番号：A123456\n氏名：テスト顧客\n来店日時：2099年10月20日 10:00"
  );
});

test("Gmail sync decodes an ISO-2022-JP reservation body from its MIME charset", async () => {
  const encodedIso2022Jp =
    "GyRCTT1Mc0hWOWYhJxsoQkExMjM0NTYKGyRCO2FMPiEnJUYlOSVIOFw1UhsoQgobJEJNaEU5Rnw7fiEnGyhCMjA5ORskQkcvGyhCMTAbJEI3bhsoQjIwGyRCRnwbKEIgMTA6MDAK";
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "iso-2022-jp" }] }],
    messagePayloads: {
      "iso-2022-jp": {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "SALON BOARD予約" },
          {
            name: "Content-Type",
            value: 'text/plain; charset="ISO-2022-JP"',
          },
        ],
        body: {
          data: Buffer.from(encodedIso2022Jp, "base64").toString("base64url"),
        },
      },
    },
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.deepEqual(runtime.syncedTexts, [
    "予約番号：A123456\n氏名：テスト顧客\n来店日時：2099年10月20日 10:00",
  ]);
});

test("Gmail sync fails closed instead of parsing a body with an unsupported charset", async () => {
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "unsupported-charset" }] }],
    messagePayloads: {
      "unsupported-charset": {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "SALON BOARD予約" },
          { name: "Content-Type", value: "text/plain; charset=x-private-mail" },
        ],
        body: {
          data: Buffer.from("予約番号：A123456").toString("base64url"),
        },
      },
    },
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.failedCount, 1);
  assert.match(body.results[0].error, /メール本文の文字コードを読み取れませんでした/);
  assert.doesNotMatch(body.results[0].error, /x-private-mail/);
  assert.deepEqual(runtime.syncedTexts, []);
});

test("Gmail sync prefers the plain part instead of duplicating multipart content", async () => {
  const plain = `予約番号：A123456\n氏名：テスト顧客\n来店日時：2099年10月20日 10:00`;
  const html = `<div>予約番号：A123456</div><div>氏名：テスト顧客</div><div>来店日時：2099年10月20日 10:00</div>`;
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "multipart" }] }],
    messagePayloads: {
      multipart: {
        mimeType: "multipart/alternative",
        headers: [{ name: "Subject", value: "SALON BOARD予約" }],
        parts: [
          {
            mimeType: "text/plain",
            body: { data: Buffer.from(plain).toString("base64url") },
          },
          {
            mimeType: "text/html",
            body: { data: Buffer.from(html).toString("base64url") },
          },
        ],
      },
    },
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.deepEqual(runtime.syncedTexts, [plain]);
});

test("Gmail sync retrieves a text body stored behind a Gmail attachment ID", async () => {
  const plain = `予約番号：A123456\n氏名：テスト顧客\n来店日時：2099年10月20日 10:00`;
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "external-body" }] }],
    messagePayloads: {
      "external-body": {
        mimeType: "text/plain",
        headers: [{ name: "Subject", value: "SALON BOARD予約" }],
        body: { attachmentId: "body-attachment" },
      },
    },
    attachmentPayloads: {
      "body-attachment": Buffer.from(plain).toString("base64url"),
    },
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.deepEqual(runtime.syncedTexts, [plain]);
  assert.deepEqual(runtime.gmailAttachmentCalls, [
    { messageId: "external-body", id: "body-attachment" },
  ]);
});

test("Gmail sync does not fetch an HTML attachment when a plain body is available", async () => {
  const plain = `予約番号：A123456\n氏名：テスト顧客`;
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "multipart-external-html" }] }],
    messagePayloads: {
      "multipart-external-html": {
        mimeType: "multipart/alternative",
        headers: [{ name: "Subject", value: "SALON BOARD予約" }],
        parts: [
          {
            mimeType: "text/plain",
            body: { data: Buffer.from(plain).toString("base64url") },
          },
          {
            mimeType: "text/html",
            body: { attachmentId: "unused-html-attachment" },
          },
        ],
      },
    },
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.deepEqual(runtime.syncedTexts, [plain]);
  assert.deepEqual(runtime.gmailAttachmentCalls, []);
});

test("Gmail sync reports a retryable failure when an external body cannot be fetched", async () => {
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "external-body-failed" }] }],
    messagePayloads: {
      "external-body-failed": {
        mimeType: "text/plain",
        headers: [{ name: "Subject", value: "SALON BOARD予約" }],
        body: { attachmentId: "failed-body-attachment" },
      },
    },
    attachmentGetFailures: ["failed-body-attachment"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.failedCount, 1);
  assert.match(body.results[0].error, /Gmail本文の取得に失敗しました/);
  assert.deepEqual(runtime.syncedTexts, []);
});

test("Gmail sync preserves a full-response thread ID when external body retrieval fails", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [
          { id: "failed-external-body" },
          { id: "same-thread-older", threadId: "failed-thread" },
          { id: "independent", threadId: "independent-thread" },
        ],
      },
    ],
    messageResponseThreadIds: {
      "failed-external-body": "failed-thread",
    },
    messagePayloads: {
      "failed-external-body": {
        mimeType: "text/plain",
        headers: [{ name: "Subject", value: "SALON BOARD予約" }],
        body: { attachmentId: "failed-thread-body" },
      },
    },
    attachmentGetFailures: ["failed-thread-body"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 207);
  assert.equal(body.ok, false);
  assert.equal(body.partial, true);
  assert.equal(body.syncedCount, 1);
  assert.equal(body.failedCount, 2);
  const deferred = body.results.find(
    (result) => result.messageId === "same-thread-older"
  );
  const independent = body.results.find(
    (result) => result.messageId === "independent"
  );
  assert.match(
    deferred.error,
    /同じGmailスレッドの本文取得に失敗したメールがあるため同期を保留しました/
  );
  assert.equal(independent.ok, true);
  assert.deepEqual(runtime.syncedTexts, ["independent"]);
});

test("Gmail sync fails closed when a message timestamp is unavailable", async () => {
  const runtime = loadRoute({
    listPages: [{ messages: [{ id: "missing-timestamp" }] }],
    messageInternalDates: { "missing-timestamp": null },
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.failedCount, 1);
  assert.match(body.results[0].error, /Gmail受信日時を取得できませんでした/);
  assert.deepEqual(runtime.syncedTexts, []);
});

test("Gmail sync bounds concurrent message fetches while preserving sync order", async () => {
  const listedIds = Array.from({ length: 12 }, (_, index) => `message-${index}`);
  const runtime = loadRoute({
    listPages: [{ messages: listedIds.map((id) => ({ id })) }],
    messageGetDelayMs: 5,
  });

  const response = await runtime.exports.POST();

  assert.equal(response.status, 200);
  assert.equal(runtime.maxGmailGetConcurrency, 5);
  assert.deepEqual(runtime.syncedTexts, listedIds.toReversed());
});

test("Gmail sync reports partial failure instead of a false all-success", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [{ id: "newer-failed" }, { id: "older-succeeded" }],
      },
    ],
    syncFailures: ["newer-failed"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 207);
  assert.equal(body.ok, false);
  assert.equal(body.partial, true);
  assert.equal(body.processedCount, 2);
  assert.equal(body.syncedCount, 1);
  assert.equal(body.failedCount, 1);
  assert.match(body.error, /1件の予約メールを同期できませんでした/);
  assert.deepEqual(runtime.syncedTexts, ["older-succeeded", "newer-failed"]);
});

test("Gmail sync keeps successful reservations when one message body cannot be fetched", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [
          { id: "newer-fetch-failed", threadId: "failed-thread" },
          { id: "older-succeeded", threadId: "independent-thread" },
        ],
      },
    ],
    messageGetFailures: ["newer-fetch-failed"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 207);
  assert.equal(body.ok, false);
  assert.equal(body.partial, true);
  assert.equal(body.processedCount, 2);
  assert.equal(body.syncedCount, 1);
  assert.equal(body.failedCount, 1);
  assert.equal(body.results[1].messageId, "newer-fetch-failed");
  assert.match(body.results[1].error, /Gmail本文の取得に失敗しました/);
  assert.deepEqual(runtime.syncedTexts, ["older-succeeded"]);
});

test("Gmail sync defers every target message when an unreadable message has no thread ID", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [
          { id: "newer-fetch-failed" },
          { id: "older-succeeded", threadId: "known-reservation-thread" },
        ],
      },
    ],
    messageGetFailures: ["newer-fetch-failed"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.partial, false);
  assert.equal(body.processedCount, 2);
  assert.equal(body.syncedCount, 0);
  assert.equal(body.failedCount, 2);
  assert.match(
    body.results[0].error,
    /スレッドIDを取得できないGmailメールの本文取得に失敗したため、予約メール全体の同期を保留しました/
  );
  assert.equal(body.results[1].messageId, "newer-fetch-failed");
  assert.deepEqual(runtime.syncedTexts, []);
});

test("Gmail sync defers a successful message when another message in the same thread cannot be fetched", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [
          { id: "newer-fetch-failed", threadId: "reservation-thread" },
          { id: "older-succeeded", threadId: "reservation-thread" },
        ],
      },
    ],
    messageGetFailures: ["newer-fetch-failed"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.partial, false);
  assert.equal(body.processedCount, 2);
  assert.equal(body.syncedCount, 0);
  assert.equal(body.failedCount, 2);
  assert.match(
    body.results[0].error,
    /同じGmailスレッドの本文取得に失敗したメールがあるため同期を保留しました/
  );
  assert.equal(body.results[1].messageId, "newer-fetch-failed");
  assert.deepEqual(runtime.syncedTexts, []);
});

test("Gmail sync recovers a successful message thread ID from the full response before deferring it", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [
          { id: "newer-fetch-failed", threadId: "reservation-thread" },
          { id: "older-succeeded" },
        ],
      },
    ],
    messageGetFailures: ["newer-fetch-failed"],
    messageResponseThreadIds: {
      "older-succeeded": "reservation-thread",
    },
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.partial, false);
  assert.equal(body.syncedCount, 0);
  assert.equal(body.failedCount, 2);
  assert.match(
    body.results[0].error,
    /同じGmailスレッドの本文取得に失敗したメールがあるため同期を保留しました/
  );
  assert.deepEqual(runtime.syncedTexts, []);
});

test("Gmail sync parses every target message before writing and defers a thread with an unparseable newer mail", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [
          { id: "newer-parse-failed", threadId: "reservation-thread" },
          { id: "older-succeeded", threadId: "reservation-thread" },
        ],
      },
    ],
    parseFailures: ["newer-parse-failed"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.partial, false);
  assert.equal(body.syncedCount, 0);
  assert.equal(body.failedCount, 2);
  assert.deepEqual(runtime.parsedTexts, [
    "older-succeeded",
    "newer-parse-failed",
  ]);
  assert.match(
    body.results[0].error,
    /同じGmailスレッドの予約メールを解析できないため同期を保留しました/
  );
  assert.match(body.results[1].error, /parse failed: newer-parse-failed/);
  assert.deepEqual(runtime.syncedTexts, []);
});

test("Gmail sync continues an unrelated thread when another known thread cannot be parsed", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [
          { id: "newer-parse-failed", threadId: "failed-thread" },
          { id: "independent-succeeded", threadId: "independent-thread" },
        ],
      },
    ],
    parseFailures: ["newer-parse-failed"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 207);
  assert.equal(body.ok, false);
  assert.equal(body.partial, true);
  assert.equal(body.syncedCount, 1);
  assert.equal(body.failedCount, 1);
  assert.deepEqual(runtime.syncedTexts, ["independent-succeeded"]);
});

test("Gmail sync defers every target thread when an unparseable mail has no thread ID", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [
          { id: "newer-parse-failed" },
          { id: "older-succeeded", threadId: "known-thread" },
        ],
      },
    ],
    parseFailures: ["newer-parse-failed"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.partial, false);
  assert.equal(body.syncedCount, 0);
  assert.equal(body.failedCount, 2);
  assert.match(
    body.results[0].error,
    /スレッドIDを取得できない予約メールの解析に失敗したため/
  );
  assert.deepEqual(runtime.syncedTexts, []);
});

test("Gmail sync reports a gateway failure when no message body can be fetched", async () => {
  const runtime = loadRoute({
    listPages: [
      {
        messages: [{ id: "fetch-failed" }],
      },
    ],
    messageGetFailures: ["fetch-failed"],
  });

  const response = await runtime.exports.POST();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.partial, false);
  assert.equal(body.processedCount, 1);
  assert.equal(body.syncedCount, 0);
  assert.equal(body.failedCount, 1);
  assert.deepEqual(runtime.syncedTexts, []);
});
