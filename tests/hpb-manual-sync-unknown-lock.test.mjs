import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/hpb-manual-sync-unknown-lock.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports, JSON, Math, Number },
);

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("manual result-unknown lock only matches the same mail", () => {
  const storage = createStorage();
  const now = 1_800_000_000_000;
  const first = exports.buildHpbManualSyncFingerprint("件名", "予約本文");
  const second = exports.buildHpbManualSyncFingerprint("別件", "別の予約本文");

  exports.markHpbManualSyncResultUnknown(storage, first, now);

  assert.equal(exports.hasAnyHpbManualSyncUnknownLock(storage, now + 1), true);
  assert.equal(
    exports.getHpbManualSyncUnknownLockUntil(storage, now + 1),
    now + exports.HPB_MANUAL_SYNC_UNKNOWN_LOCK_TTL_MS,
  );
  assert.equal(exports.hasHpbManualSyncUnknownLock(storage, first, now + 1), true);
  assert.equal(exports.hasHpbManualSyncUnknownLock(storage, second, now + 1), false);
});

test("manual result-unknown locks expire and known results clear one mail", () => {
  const storage = createStorage();
  const now = 1_800_000_000_000;
  const first = exports.buildHpbManualSyncFingerprint("件名1", "予約本文1");
  const second = exports.buildHpbManualSyncFingerprint("件名2", "予約本文2");

  exports.markHpbManualSyncResultUnknown(storage, first, now);
  exports.markHpbManualSyncResultUnknown(storage, second, now + 1);
  exports.clearHpbManualSyncUnknownLock(storage, first, now + 2);

  assert.equal(exports.hasHpbManualSyncUnknownLock(storage, first, now + 3), false);
  assert.equal(exports.hasHpbManualSyncUnknownLock(storage, second, now + 3), true);
  assert.equal(
    exports.hasAnyHpbManualSyncUnknownLock(
      storage,
      now + exports.HPB_MANUAL_SYNC_UNKNOWN_LOCK_TTL_MS + 1,
    ),
    false,
  );
  assert.equal(
    exports.getHpbManualSyncUnknownLockUntil(
      storage,
      now + exports.HPB_MANUAL_SYNC_UNKNOWN_LOCK_TTL_MS + 1,
    ),
    null,
  );
});

test("manual lock stores only a fingerprint and tolerates storage failures", () => {
  const storage = createStorage();
  const fingerprint = exports.buildHpbManualSyncFingerprint(
    "顧客名を含む件名",
    "電話番号を含む予約本文",
  );
  exports.markHpbManualSyncResultUnknown(storage, fingerprint, 1_000);

  const stored = storage.getItem("aily:hpb-manual-sync-result-unknown:v1");
  assert.ok(stored);
  assert.doesNotMatch(stored, /顧客名|電話番号/);

  const unavailable = {
    getItem() { throw new Error("unavailable"); },
    setItem() { throw new Error("unavailable"); },
    removeItem() { throw new Error("unavailable"); },
  };
  assert.equal(exports.hasAnyHpbManualSyncUnknownLock(unavailable), false);
  assert.doesNotThrow(() =>
    exports.markHpbManualSyncResultUnknown(unavailable, fingerprint),
  );
});
