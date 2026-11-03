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
vm.runInNewContext(source, { exports, Date, JSON, Math, Promise, RegExp });

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

test("staff reservation owner ID survives a reload only within the same tab session", () => {
  const firstTab = makeStorage();
  const secondTab = makeStorage();
  let created = 0;
  const create = () => {
    created += 1;
    return created === 1 ? FIRST_ID : SECOND_ID;
  };

  assert.equal(
    exports.getOrCreateStaffReservationSubmissionOwnerId(firstTab, create),
    FIRST_ID,
  );
  assert.equal(
    exports.getOrCreateStaffReservationSubmissionOwnerId(firstTab, create),
    FIRST_ID,
  );
  assert.equal(
    exports.getOrCreateStaffReservationSubmissionOwnerId(secondTab, create),
    SECOND_ID,
  );
  assert.equal(created, 2);
});

test("staff reservation exposes a valid pending operation for read-only reconciliation", () => {
  const storage = makeStorage();
  const fingerprint = exports.buildStaffReservationFingerprint(submission);
  exports.getOrCreateStaffReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(exports.getPendingStaffReservationOperation(storage)),
    ),
    { fingerprint, operationId: FIRST_ID },
  );
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

test("staff reservation submission claim allows only the tab that owns the active operation", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildStaffReservationFingerprint(submission);
  exports.getOrCreateStaffReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );

  const firstOwner = "55555555-5555-4555-8555-555555555555";
  const secondOwner = "66666666-6666-4666-8666-666666666666";
  const now = Date.now();
  const first = await exports.claimStaffReservationSubmission(
    storage,
    FIRST_ID,
    firstOwner,
    now,
    async () => {},
  );
  const second = await exports.claimStaffReservationSubmission(
    storage,
    FIRST_ID,
    secondOwner,
    now + 1_000,
    async () => {},
  );

  assert.equal(first.acquired, true);
  assert.equal(first.claim.ownerId, firstOwner);
  assert.equal(second.acquired, false);
  assert.equal(second.claim.ownerId, firstOwner);
});

test("staff reservation submission claim can be recovered after its five-minute window", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildStaffReservationFingerprint(submission);
  exports.getOrCreateStaffReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );
  const firstOwner = "55555555-5555-4555-8555-555555555555";
  const secondOwner = "66666666-6666-4666-8666-666666666666";
  const now = Date.now();
  await exports.claimStaffReservationSubmission(
    storage,
    FIRST_ID,
    firstOwner,
    now,
    async () => {},
  );

  const recovered = await exports.claimStaffReservationSubmission(
    storage,
    FIRST_ID,
    secondOwner,
    now + exports.STAFF_RESERVATION_SUBMISSION_CLAIM_TTL_MS,
    async () => {},
  );

  assert.equal(recovered.acquired, true);
  assert.equal(recovered.claim.ownerId, secondOwner);
});

test("staff reservation concurrent claims proceed only for the persisted winner", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildStaffReservationFingerprint(submission);
  exports.getOrCreateStaffReservationOperationId(
    storage,
    fingerprint,
    () => FIRST_ID,
  );
  const firstOwner = "55555555-5555-4555-8555-555555555555";
  const secondOwner = "66666666-6666-4666-8666-666666666666";
  const now = Date.now();
  let settleFirst;
  const first = exports.claimStaffReservationSubmission(
    storage,
    FIRST_ID,
    firstOwner,
    now,
    () => new Promise((resolve) => {
      settleFirst = resolve;
    }),
  );
  storage.setItem(
    "aily:staff-reservation-submission:v1",
    JSON.stringify({
      fingerprint,
      operationId: FIRST_ID,
      submissionOwnerId: secondOwner,
      submissionStartedAt: now,
    }),
  );
  settleFirst();

  const firstResult = await first;
  assert.equal(firstResult.acquired, false);
  assert.equal(firstResult.claim.ownerId, secondOwner);
});
