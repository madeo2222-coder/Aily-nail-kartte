import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../lib/hpb-sync-request.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { AbortController, clearTimeout, exports, fetch, setTimeout },
);

const {
  HPB_SYNC_REQUEST_TIMEOUT_MS,
  requestHpbSyncWithTimeout,
} = exports;

test("HPB sync stops waiting while preserving an unknown result lock", async () => {
  let requestSignal;
  let requestBody;
  const neverResponds = (_url, options) => {
    requestSignal = options.signal;
    requestBody = JSON.parse(options.body);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(new Error("request aborted"));
      });
    });
  };

  await assert.rejects(
    requestHpbSyncWithTimeout(
      "/api/hpb-mail-sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "予約", text: "架空の本文" }),
      },
      neverResponds,
      5,
    ),
    /request aborted/,
  );

  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(requestBody, { subject: "予約", text: "架空の本文" });
  assert.equal(HPB_SYNC_REQUEST_TIMEOUT_MS, 60_000);
});

test("both reservation sync screens use the bounded request", () => {
  const calendarSource = readFileSync(
    new URL("../app/reservations/calendar/page.tsx", import.meta.url),
    "utf8",
  );
  const syncCenterSource = readFileSync(
    new URL("../app/hpb-mail-sync-test/page.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(
    calendarSource.match(/requestHpbSyncWithTimeout\(/g)?.length,
    1,
  );
  assert.equal(
    syncCenterSource.match(/requestHpbSyncWithTimeout\(/g)?.length,
    2,
  );
  assert.match(calendarSource, /"\/api\/hpb-gmail-sync"/);
  assert.match(syncCenterSource, /"\/api\/hpb-mail-sync"/);
  assert.match(syncCenterSource, /"\/api\/hpb-gmail-sync"/);
});
