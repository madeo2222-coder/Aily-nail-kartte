import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
const source = ts.transpileModule(
  readFileSync(
    new URL("../lib/staff-reservation-submission.ts", import.meta.url),
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
  mode: "normal",
  salonId: "salon-1",
  customerId: "customer-1",
  staffId: "staff-1",
  menu: "ワンカラー",
  startAt: "2099-10-19T01:00:00.000Z",
  endAt: "2099-10-19T02:30:00.000Z",
  status: "予約",
  memo: "確認メモ",
};
const FIRST_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_ID = "44444444-4444-4444-8444-444444444444";

test("staff reservation operation ID survives a response-loss reload for the same payload", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildStaffReservationFingerprint(submission);
  let created = 0;
  const create = () => {
    created += 1;
    return FIRST_ID;
  };

  assert.equal(
    exports.getOrCreateStaffReservationOperationId(storage, fingerprint, create),
    FIRST_ID,
  );
  assert.equal(
    exports.getOrCreateStaffReservationOperationId(storage, fingerprint, create),
    FIRST_ID,
  );
  assert.equal(created, 1);
});

test("staff reservation operation ID rotates when the submitted payload changes", () => {
  const storage = makeStorage();
  const first = exports.buildStaffReservationFingerprint(submission);
  const second = exports.buildStaffReservationFingerprint({
    ...submission,
    startAt: "2099-10-20T01:00:00.000Z",
  });

  exports.getOrCreateStaffReservationOperationId(storage, first, () => FIRST_ID);
  assert.equal(
    exports.getOrCreateStaffReservationOperationId(storage, second, () => SECOND_ID),
    SECOND_ID,
  );
});

test("staff reservation cleanup removes only the matching completed operation", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildStaffReservationFingerprint(submission);
  exports.getOrCreateStaffReservationOperationId(storage, fingerprint, () => FIRST_ID);

  exports.clearStaffReservationOperation(storage, SECOND_ID);
  assert.equal(
    exports.getOrCreateStaffReservationOperationId(storage, fingerprint, () => SECOND_ID),
    FIRST_ID,
  );

  exports.clearStaffReservationOperation(storage, FIRST_ID);
  assert.equal(
    exports.getOrCreateStaffReservationOperationId(storage, fingerprint, () => SECOND_ID),
    SECOND_ID,
  );
});
