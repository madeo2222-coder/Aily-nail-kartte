import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
const source = ts.transpileModule(
  readFileSync(
    new URL("../lib/external-calendar-block-submission.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
vm.runInNewContext(source, { exports, JSON, RegExp });

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

const submission = {
  source: "HPB",
  salonId: "salon-1",
  staffId: "staff-1",
  date: "2099-10-30",
  startTime: "10:00",
  endTime: "11:00",
  title: "外部予約",
  memo: "受付番号123",
};
const FIRST_ID = "55555555-5555-4555-8555-555555555555";
const SECOND_ID = "66666666-6666-4666-8666-666666666666";

test("external block operation ID survives a response-loss reload for the same payload", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildExternalBlockFingerprint(submission);
  let created = 0;
  const create = () => {
    created += 1;
    return FIRST_ID;
  };

  assert.equal(
    exports.getOrCreateExternalBlockOperationId(storage, fingerprint, create),
    FIRST_ID,
  );
  assert.equal(
    exports.getOrCreateExternalBlockOperationId(storage, fingerprint, create),
    FIRST_ID,
  );
  assert.equal(created, 1);
});

test("external block operation ID rotates when the submitted payload changes", () => {
  const storage = makeStorage();
  const first = exports.buildExternalBlockFingerprint(submission);
  const second = exports.buildExternalBlockFingerprint({
    ...submission,
    startTime: "11:00",
  });

  exports.getOrCreateExternalBlockOperationId(storage, first, () => FIRST_ID);
  assert.equal(
    exports.getOrCreateExternalBlockOperationId(storage, second, () => SECOND_ID),
    SECOND_ID,
  );
});

test("external block cleanup removes only the matching completed operation", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildExternalBlockFingerprint(submission);
  exports.getOrCreateExternalBlockOperationId(storage, fingerprint, () => FIRST_ID);

  exports.clearExternalBlockOperation(storage, SECOND_ID);
  assert.equal(
    exports.getOrCreateExternalBlockOperationId(storage, fingerprint, () => SECOND_ID),
    FIRST_ID,
  );

  exports.clearExternalBlockOperation(storage, FIRST_ID);
  assert.equal(
    exports.getOrCreateExternalBlockOperationId(storage, fingerprint, () => SECOND_ID),
    SECOND_ID,
  );
});
