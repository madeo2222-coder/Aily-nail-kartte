import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
const source = ts.transpileModule(
  readFileSync(
    new URL("../lib/customer-reservation-submission.ts", import.meta.url),
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
  menu: "ワンカラー",
  date: "2099-10-30",
  time: "10:00",
  staffId: "staff-1",
  durationMinutes: 90,
  memo: "希望メモ",
};
const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

test("customer reservation operation ID survives a response-loss reload", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  let created = 0;
  const create = () => {
    created += 1;
    return FIRST_ID;
  };

  assert.equal(
    exports.getOrCreateCustomerReservationOperationId(
      storage,
      fingerprint,
      create,
    ),
    FIRST_ID,
  );
  assert.equal(
    exports.getOrCreateCustomerReservationOperationId(
      storage,
      fingerprint,
      create,
    ),
    FIRST_ID,
  );
  assert.equal(created, 1);
});

test("customer reservation operation ID rotates when the payload changes", () => {
  const storage = makeStorage();
  const first = exports.buildCustomerReservationFingerprint(submission);
  const second = exports.buildCustomerReservationFingerprint({
    ...submission,
    time: "10:30",
  });

  exports.getOrCreateCustomerReservationOperationId(storage, first, () => FIRST_ID);
  assert.equal(
    exports.getOrCreateCustomerReservationOperationId(
      storage,
      second,
      () => SECOND_ID,
    ),
    SECOND_ID,
  );
});

test("customer reservation cleanup removes only the completed operation", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );

  exports.clearCustomerReservationOperation(storage, SECOND_ID);
  assert.equal(
    exports.getOrCreateCustomerReservationOperationId(
      storage,
      fingerprint,
      () => SECOND_ID,
    ),
    FIRST_ID,
  );

  exports.clearCustomerReservationOperation(storage, FIRST_ID);
  assert.equal(
    exports.getOrCreateCustomerReservationOperationId(
      storage,
      fingerprint,
      () => SECOND_ID,
    ),
    SECOND_ID,
  );
});
