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
  vm.runInNewContext(compiled, { exports, require, Set, Date, JSON, Number });
  return exports;
}

const {
  CONFIRMATION_LINE_RETRY_LOCK_TTL_MS,
  getConfirmationLineRetryLock,
  readConfirmationLineRetryLock,
  saveConfirmationLineRetryLock,
} = loadRetryLockModule();

function createMemoryStorage() {
  const entries = new Map();

  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
    removeItem(key) {
      entries.delete(key);
    },
    entries,
  };
}

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

test("restores a retry lock after a page reload within the retry window", () => {
  const storage = createMemoryStorage();
  const lock = {
    kind: "history_check",
    message: "通知履歴を確認してください。",
  };

  saveConfirmationLineRetryLock(storage, "reservation-1", lock, 1_000);

  const restored = readConfirmationLineRetryLock(
    storage,
    "reservation-1",
    2_000
  );
  assert.equal(restored.kind, "history_check");
  assert.match(restored.message, /同じ送信を繰り返さず/);
  assert.doesNotMatch([...storage.entries.values()][0], /通知履歴/);
});

test("clears retryable, expired, and malformed stored locks", () => {
  const storage = createMemoryStorage();
  const lock = { kind: "sent", message: "送信済みです。" };

  saveConfirmationLineRetryLock(storage, "reservation-1", lock, 1_000);
  saveConfirmationLineRetryLock(storage, "reservation-1", null, 2_000);
  assert.equal(
    readConfirmationLineRetryLock(storage, "reservation-1", 3_000),
    null
  );

  saveConfirmationLineRetryLock(storage, "reservation-2", lock, 1_000);
  assert.equal(
    readConfirmationLineRetryLock(
      storage,
      "reservation-2",
      1_000 + CONFIRMATION_LINE_RETRY_LOCK_TTL_MS
    ),
    null
  );

  storage.setItem(
    "aily:confirmation-line-retry-lock:v1:reservation-3",
    "not-json"
  );
  assert.equal(
    readConfirmationLineRetryLock(storage, "reservation-3", 3_000),
    null
  );
  assert.equal(storage.entries.size, 0);
});

test("storage failures do not replace the current screen's in-memory guard", () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };

  assert.doesNotThrow(() =>
    saveConfirmationLineRetryLock(
      unavailableStorage,
      "reservation-1",
      getConfirmationLineRetryLock(null),
      1_000
    )
  );
  assert.equal(
    readConfirmationLineRetryLock(unavailableStorage, "reservation-1", 2_000),
    null
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
    assert.match(
      source,
      /readConfirmationLineRetryLock\([\s\S]{0,80}window\.localStorage/
    );
    assert.match(source, /saveConfirmationLineRetryLock\(/);
  }
  assert.match(
    listPage,
    /canRetryConfirmationLine\(item\.status\) &&[\s\S]{0,80}!isExternalSynced \? \([\s\S]{0,120}confirmationLineRetryLocks\[item\.id\] \?/
  );
  assert.match(editPage, /!confirmationLineRetryLock/);
});

test("external synced reservation edit screen is read-only before any mutation request", () => {
  const editPage = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    editPage,
    /async function handleSubmit[\s\S]{0,220}if \(isExternalSynced\) \{[\s\S]{0,180}予約元で変更・キャンセルしてください。[\s\S]{0,40}return;/
  );
  assert.match(
    editPage,
    /async function handleDelete[\s\S]{0,180}if \(isExternalSynced\) \{[\s\S]{0,180}予約元で変更・キャンセルしてください。[\s\S]{0,40}return;/
  );
  assert.match(
    editPage,
    /<fieldset disabled=\{isExternalSynced\} className="grid gap-4">/
  );
  assert.match(
    editPage,
    /isExternalSynced \? \([\s\S]{0,260}閲覧専用：変更・キャンセルは予約元で行ってください/
  );
  assert.match(
    editPage,
    /status === "キャンセル" &&[\s\S]{0,100}!isExternalSynced &&/
  );
});
