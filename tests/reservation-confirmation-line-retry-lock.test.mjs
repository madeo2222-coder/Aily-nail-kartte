import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadRetryLockModule() {
  const source = readFileSync(
    new URL("../lib/reservation-confirmation-line-retry.ts", import.meta.url),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require, Set });
  return exports;
}

const { getConfirmationLineRetryLock } = loadRetryLockModule();

test("blocks an immediate retry when the browser cannot read the LINE result", () => {
  const lock = getConfirmationLineRetryLock(null);
  assert.equal(lock.kind, "history_check");
  assert.match(lock.message, /同じ送信を繰り返さず/);
});

test("keeps retry available only for a recorded retryable failure", () => {
  assert.equal(
    getConfirmationLineRetryLock({
      ok: false,
      status: "failed",
      retryable: true,
      error: "再試行できます。",
    }),
    null
  );
  assert.equal(
    getConfirmationLineRetryLock({
      ok: false,
      status: "not_linked",
      error: "LINE連携がありません。",
    }),
    null
  );
});

test("blocks retry when the server requires delivery-history confirmation", () => {
  for (const status of [
    "unknown",
    "sent_unrecorded",
    "retry_expired",
    "message_changed",
  ]) {
    const lock = getConfirmationLineRetryLock({
      ok: false,
      status,
      retryable: status === "unknown" ? false : undefined,
      error: `${status}: 履歴を確認してください。`,
    });
    assert.equal(lock.kind, "history_check", status);
    assert.match(lock.message, /履歴を確認/, status);
  }
});

test("removes retry after a known successful or already completed send", () => {
  assert.equal(
    getConfirmationLineRetryLock({ ok: true, sent: true }).kind,
    "sent"
  );
  assert.equal(
    getConfirmationLineRetryLock({ ok: true, alreadySent: true }).kind,
    "sent"
  );
});

test("both staff reservation screens apply the shared retry lock", () => {
  const listPage = readFileSync(
    new URL("../app/reservations/ReservationsPageClient.tsx", import.meta.url),
    "utf8"
  );
  const editPage = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  for (const source of [listPage, editPage]) {
    assert.match(source, /getConfirmationLineRetryLock\(result|lineData|null/);
    assert.match(source, /confirmationLineRetryLock/);
    assert.match(source, /確定LINEを再試行/);
  }
  assert.match(
    listPage,
    /canRetryConfirmationLine\(item\.status\) \? \([\s\S]{0,120}confirmationLineRetryLocks\[item\.id\] \?/
  );
  assert.match(editPage, /!confirmationLineRetryLock/);
});
