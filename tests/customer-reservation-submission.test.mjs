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
const FIRST_OWNER_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_OWNER_ID = "44444444-4444-4444-8444-444444444444";
const CUSTOMER_ID = "customer-1";

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
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        exports.getPendingCustomerReservationSubmission(storage),
      ),
    ),
    { submission, operationId: FIRST_ID },
  );
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

test("customer reservation restores a retryable notification for 24 hours", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  const now = Date.UTC(2026, 9, 30, 4, 0, 0);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );

  assert.equal(
    exports.markCustomerReservationNotificationRetryable(
      storage,
      FIRST_ID,
      CUSTOMER_ID,
      now,
    ),
    true,
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        exports.getCustomerReservationNotificationRetry(
          storage,
          CUSTOMER_ID,
          now + 60_000,
        ),
      ),
    ),
    { submission, operationId: FIRST_ID },
  );
  assert.equal(
    exports.getPendingCustomerReservationSubmission(storage),
    null,
  );
});

test("customer reservation expires a retryable notification after 24 hours", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  const now = Date.UTC(2026, 9, 30, 4, 0, 0);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );
  exports.markCustomerReservationNotificationRetryable(
    storage,
    FIRST_ID,
    CUSTOMER_ID,
    now,
  );

  assert.equal(
    exports.getCustomerReservationNotificationRetry(
      storage,
      CUSTOMER_ID,
      now + 24 * 60 * 60 * 1000 + 1,
    ),
    null,
  );
  assert.equal(
    exports.getOrCreateCustomerReservationOperationId(
      storage,
      fingerprint,
      () => SECOND_ID,
    ),
    SECOND_ID,
  );
});

test("customer reservation does not mark a different operation for notification retry", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );

  assert.equal(
    exports.markCustomerReservationNotificationRetryable(
      storage,
      SECOND_ID,
      CUSTOMER_ID,
      Date.now(),
    ),
    false,
  );
  assert.equal(
    exports.getCustomerReservationNotificationRetry(
      storage,
      CUSTOMER_ID,
      Date.now(),
    ),
    null,
  );
});

test("customer reservation restores a notification only for its customer", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  const now = Date.UTC(2026, 9, 30, 4, 0, 0);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );
  exports.markCustomerReservationNotificationRetryable(
    storage,
    FIRST_ID,
    CUSTOMER_ID,
    now,
  );

  assert.equal(
    exports.getCustomerReservationNotificationRetry(
      storage,
      "customer-2",
      now,
    ),
    null,
  );
  assert.equal(
    exports.getCustomerReservationNotificationRetry(
      storage,
      CUSTOMER_ID,
      now,
    )?.operationId,
    FIRST_ID,
  );
});

test("customer reservation ignores a malformed retry payload", () => {
  const storage = makeStorage();
  const now = Date.UTC(2026, 9, 30, 4, 0, 0);
  const malformedFingerprint = JSON.stringify([
    "ワンカラー",
    "2026-11-01",
    "10:00",
    "staff-1",
    "90",
    "希望メモ",
  ]);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    malformedFingerprint,
    () => FIRST_ID,
  );
  exports.markCustomerReservationNotificationRetryable(
    storage,
    FIRST_ID,
    CUSTOMER_ID,
    now,
  );

  assert.equal(
    exports.getCustomerReservationNotificationRetry(
      storage,
      CUSTOMER_ID,
      now,
    ),
    null,
  );
  assert.equal(
    exports.getOrCreateCustomerReservationOperationId(
      storage,
      malformedFingerprint,
      () => SECOND_ID,
    ),
    SECOND_ID,
  );
});

test("customer reservation submission claim allows only one tab", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );
  const now = Date.now();

  const first = await exports.claimCustomerReservationSubmission(
    storage,
    FIRST_ID,
    FIRST_OWNER_ID,
    now,
    async () => {},
  );
  const second = await exports.claimCustomerReservationSubmission(
    storage,
    FIRST_ID,
    SECOND_OWNER_ID,
    now,
    async () => {},
  );

  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  assert.equal(second.claim.ownerId, FIRST_OWNER_ID);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        exports.getPendingCustomerReservationSubmission(storage),
      ),
    ),
    { submission, operationId: FIRST_ID },
  );
});

test("customer reservation submission claim remains owned while its confirmation settles", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );
  const now = Date.now();
  let releaseFirst;
  const firstSettled = new Promise(resolve => {
    releaseFirst = resolve;
  });

  const firstPromise = exports.claimCustomerReservationSubmission(
    storage,
    FIRST_ID,
    FIRST_OWNER_ID,
    now,
    () => firstSettled,
  );
  const second = await exports.claimCustomerReservationSubmission(
    storage,
    FIRST_ID,
    SECOND_OWNER_ID,
    now,
    async () => {},
  );
  releaseFirst();
  const first = await firstPromise;

  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
});

test("customer reservation submission claim expires and can be recovered", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );
  const now = Date.now();
  await exports.claimCustomerReservationSubmission(
    storage,
    FIRST_ID,
    FIRST_OWNER_ID,
    now,
    async () => {},
  );

  const recovered = await exports.claimCustomerReservationSubmission(
    storage,
    FIRST_ID,
    SECOND_OWNER_ID,
    now + 5 * 60 * 1000,
    async () => {},
  );

  assert.equal(recovered.acquired, true);
  assert.equal(recovered.claim.ownerId, SECOND_OWNER_ID);
});

test("customer reservation submission claim can only be released by its owner", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );
  const now = Date.now();
  await exports.claimCustomerReservationSubmission(
    storage,
    FIRST_ID,
    FIRST_OWNER_ID,
    now,
    async () => {},
  );

  assert.equal(
    exports.releaseCustomerReservationSubmissionClaim(
      storage,
      FIRST_ID,
      SECOND_OWNER_ID,
    ),
    false,
  );
  assert.equal(
    exports.releaseCustomerReservationSubmissionClaim(
      storage,
      FIRST_ID,
      FIRST_OWNER_ID,
    ),
    true,
  );
  const second = await exports.claimCustomerReservationSubmission(
    storage,
    FIRST_ID,
    SECOND_OWNER_ID,
    now,
    async () => {},
  );
  assert.equal(second.acquired, true);
});

test("notification retry clears a stale reservation submission claim", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildCustomerReservationFingerprint(submission);
  const now = Date.now();
  exports.getOrCreateCustomerReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );
  await exports.claimCustomerReservationSubmission(
    storage,
    FIRST_ID,
    FIRST_OWNER_ID,
    now,
    async () => {},
  );

  assert.equal(
    exports.markCustomerReservationNotificationRetryable(
      storage,
      FIRST_ID,
      CUSTOMER_ID,
      now,
    ),
    true,
  );
  assert.equal(
    exports.releaseCustomerReservationSubmissionClaim(
      storage,
      FIRST_ID,
      FIRST_OWNER_ID,
    ),
    false,
  );
});
