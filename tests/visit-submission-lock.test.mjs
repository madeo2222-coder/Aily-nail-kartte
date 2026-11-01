import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
const source = ts.transpileModule(
  readFileSync(
    new URL("../lib/visit-submission-lock.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
vm.runInNewContext(source, { exports, Date, JSON, Number });

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const visit = {
  reservationId: null,
  customerId: "10000000-0000-4000-8000-000000000001",
  staffId: "20000000-0000-4000-8000-000000000002",
  visitDate: "2026-11-01",
};

test("an uncertain visit remains locked after a page reload", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildVisitSubmissionFingerprint(visit);

  exports.markVisitSubmissionPending(storage, fingerprint, 1_000);
  assert.equal(
    exports.hasActiveVisitSubmissionLock(storage, fingerprint, 2_000),
    true,
  );
});

test("a different visit identity remains available", () => {
  const storage = makeStorage();
  const first = exports.buildVisitSubmissionFingerprint(visit);
  const second = exports.buildVisitSubmissionFingerprint({
    ...visit,
    visitDate: "2026-11-02",
  });

  exports.markVisitSubmissionPending(storage, first, 1_000);
  assert.equal(exports.hasActiveVisitSubmissionLock(storage, second, 2_000), false);
  assert.equal(exports.hasActiveVisitSubmissionLock(storage, first, 2_000), true);
});

test("a confirmed result clears only its matching visit lock", () => {
  const storage = makeStorage();
  const first = exports.buildVisitSubmissionFingerprint(visit);
  const second = exports.buildVisitSubmissionFingerprint({
    ...visit,
    customerId: "30000000-0000-4000-8000-000000000003",
  });

  exports.markVisitSubmissionPending(storage, first, 1_000);
  exports.markVisitSubmissionPending(storage, second, 1_000);
  exports.clearVisitSubmissionLock(storage, first, 2_000);

  assert.equal(exports.hasActiveVisitSubmissionLock(storage, first, 2_000), false);
  assert.equal(exports.hasActiveVisitSubmissionLock(storage, second, 2_000), true);
});

test("an old visit lock expires after 24 hours", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildVisitSubmissionFingerprint(visit);

  exports.markVisitSubmissionPending(storage, fingerprint, 1_000);
  assert.equal(
    exports.hasActiveVisitSubmissionLock(
      storage,
      fingerprint,
      1_000 + 24 * 60 * 60 * 1000 + 1,
    ),
    false,
  );
});
