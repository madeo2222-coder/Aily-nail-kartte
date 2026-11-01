import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/hpb-gmail-sync-unknown-lock.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports, JSON, Number },
);

const {
  HPB_GMAIL_SYNC_UNKNOWN_LOCK_TTL_MS,
  readHpbGmailSyncUnknownLock,
  saveHpbGmailSyncUnknownLock,
} = exports;

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("unknown Gmail sync survives a page reload during the review window", () => {
  const storage = createStorage();
  const now = 1_800_000_000_000;

  saveHpbGmailSyncUnknownLock(storage, true, now);

  assert.equal(readHpbGmailSyncUnknownLock(storage, now + 1_000), true);
  assert.equal(
    readHpbGmailSyncUnknownLock(
      storage,
      now + HPB_GMAIL_SYNC_UNKNOWN_LOCK_TTL_MS - 1,
    ),
    true,
  );
});

test("unknown Gmail sync lock expires and removes stale storage", () => {
  const storage = createStorage();
  const now = 1_800_000_000_000;

  saveHpbGmailSyncUnknownLock(storage, true, now);

  assert.equal(
    readHpbGmailSyncUnknownLock(
      storage,
      now + HPB_GMAIL_SYNC_UNKNOWN_LOCK_TTL_MS,
    ),
    false,
  );
  assert.equal(readHpbGmailSyncUnknownLock(storage, now + 1), false);
});

test("known Gmail sync result clears the unknown-result lock", () => {
  const storage = createStorage();
  const now = 1_800_000_000_000;

  saveHpbGmailSyncUnknownLock(storage, true, now);
  saveHpbGmailSyncUnknownLock(storage, false, now + 1_000);

  assert.equal(readHpbGmailSyncUnknownLock(storage, now + 2_000), false);
});

test("malformed storage fails open without throwing", () => {
  const storage = createStorage();
  storage.setItem("aily:hpb-gmail-sync-result-unknown:v1", "not-json");

  assert.equal(readHpbGmailSyncUnknownLock(storage), false);
});

test("storage failures keep the caller usable", () => {
  const storage = {
    getItem() {
      throw new Error("unavailable");
    },
    setItem() {
      throw new Error("unavailable");
    },
    removeItem() {
      throw new Error("unavailable");
    },
  };

  assert.doesNotThrow(() => saveHpbGmailSyncUnknownLock(storage, true));
  assert.equal(readHpbGmailSyncUnknownLock(storage), false);
});
