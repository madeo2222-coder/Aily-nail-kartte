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
vm.runInNewContext(source, { exports, JSON, RegExp, Date, Math, Promise });

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

test("external block owner ID is stable within a tab", () => {
  const storage = makeStorage();
  let created = 0;
  const create = () => {
    created += 1;
    return FIRST_ID;
  };

  assert.equal(
    exports.getOrCreateExternalBlockSubmissionOwnerId(storage, create),
    FIRST_ID,
  );
  assert.equal(
    exports.getOrCreateExternalBlockSubmissionOwnerId(storage, create),
    FIRST_ID,
  );
  assert.equal(created, 1);
});

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
  assert.equal(
    exports.getPendingExternalBlockOperationId(storage),
    FIRST_ID,
  );
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
  assert.equal(exports.getPendingExternalBlockOperationId(storage), null);
  assert.equal(
    exports.getOrCreateExternalBlockOperationId(storage, fingerprint, () => SECOND_ID),
    SECOND_ID,
  );
});

test("external block submission claim allows only the tab that owns the active operation", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildExternalBlockFingerprint(submission);
  exports.getOrCreateExternalBlockOperationId(storage, fingerprint, () => FIRST_ID);
  const firstOwner = FIRST_ID;
  const secondOwner = SECOND_ID;
  const now = Date.now();

  const first = await exports.claimExternalBlockSubmission(
    storage,
    FIRST_ID,
    firstOwner,
    now,
    async () => {},
  );
  const second = await exports.claimExternalBlockSubmission(
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

test("external block submission claim can be recovered after five minutes", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildExternalBlockFingerprint(submission);
  exports.getOrCreateExternalBlockOperationId(storage, fingerprint, () => FIRST_ID);
  const now = Date.now();
  await exports.claimExternalBlockSubmission(
    storage,
    FIRST_ID,
    FIRST_ID,
    now,
    async () => {},
  );

  const recovered = await exports.claimExternalBlockSubmission(
    storage,
    FIRST_ID,
    SECOND_ID,
    now + exports.EXTERNAL_BLOCK_SUBMISSION_CLAIM_TTL_MS,
    async () => {},
  );

  assert.equal(recovered.acquired, true);
  assert.equal(recovered.claim.ownerId, SECOND_ID);
});

test("external block concurrent claims proceed only for the persisted winner", async () => {
  const storage = makeStorage();
  const fingerprint = exports.buildExternalBlockFingerprint(submission);
  exports.getOrCreateExternalBlockOperationId(storage, fingerprint, () => FIRST_ID);
  const now = Date.now();
  let settleFirst;
  const first = exports.claimExternalBlockSubmission(
    storage,
    FIRST_ID,
    FIRST_ID,
    now,
    () => new Promise((resolve) => {
      settleFirst = resolve;
    }),
  );
  storage.setItem(
    "aily:external-calendar-block-submission:v1",
    JSON.stringify({
      fingerprint,
      operationId: FIRST_ID,
      submissionOwnerId: SECOND_ID,
      submissionStartedAt: now,
    }),
  );
  settleFirst();

  const firstResult = await first;
  assert.equal(firstResult.acquired, false);
  assert.equal(firstResult.claim.ownerId, SECOND_ID);
});
