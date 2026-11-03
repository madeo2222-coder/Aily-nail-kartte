import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL(
        "../lib/reservation-confirmation-email-retry.ts",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { AbortController, clearTimeout, exports, fetch, setTimeout }
);

const {
  CONFIRMATION_EMAIL_IN_PROGRESS_LOCK_TTL_MS,
  CONFIRMATION_EMAIL_REQUEST_TIMEOUT_MS,
  claimConfirmationEmailInProgressLock,
  createConfirmationEmailAttemptId,
  getConfirmationEmailActionPrompt,
  getConfirmationEmailInProgressLock,
  getConfirmationEmailInProgressNotice,
  getConfirmationEmailRecoveryNotice,
  getConfirmationEmailNotice,
  getExpiredConfirmationEmailNotice,
  isConfirmationEmailRetryActive,
  readConfirmationEmailDisplayNotice,
  readConfirmationEmailInProgressLock,
  readConfirmationEmailRetryNotice,
  requestConfirmationEmailWithTimeout,
  saveConfirmationEmailInProgressLock,
  saveConfirmationEmailRetryNotice,
} = exports;

test("confirmation email request stops waiting and preserves a recoverable unknown result", async () => {
  let requestSignal;
  const neverResponds = (_url, options) => {
    requestSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(new Error("request aborted"));
      });
    });
  };

  await assert.rejects(
    requestConfirmationEmailWithTimeout(
      {
        reservationId: "reservation-1",
        attemptId: "01234567-89ab-4cde-8fab-0123456789ab",
      },
      neverResponds,
      5
    ),
    /request aborted/
  );

  assert.equal(requestSignal.aborted, true);
  assert.equal(CONFIRMATION_EMAIL_REQUEST_TIMEOUT_MS, 15_000);
});

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("offers a bounded first email send after an unknown confirmation result", () => {
  const startedAt = 9_000;
  const notice = getConfirmationEmailRecoveryNotice(startedAt);

  assert.equal(notice.canRetry, true);
  assert.equal(notice.completed, false);
  assert.equal(notice.actionLabel, "確定メールを送信");
  assert.equal(notice.expiresAt, startedAt + 24 * 60 * 60 * 1000);
  assert.match(notice.message, /確定済みと確認できた場合/);
  assert.match(
    getConfirmationEmailActionPrompt(notice),
    /確定済みと確認した予約/
  );
  assert.doesNotMatch(getConfirmationEmailActionPrompt(notice), /再試行/);
});

test("enables a same-screen retry when the confirmation email response is lost", () => {
  const startedAt = 12_345;
  const attemptId = "123e4567-e89b-42d3-a456-426614174000";
  const notice = getConfirmationEmailNotice(
    false,
    null,
    startedAt,
    null,
    attemptId
  );

  assert.equal(notice.canRetry, true);
  assert.equal(notice.completed, false);
  assert.equal(notice.retryWindowHours, 24);
  assert.equal(notice.expiresAt, startedAt + 24 * 60 * 60 * 1000);
  assert.equal(notice.attemptId, attemptId);
  assert.match(notice.message, /24時間以内/);
  assert.match(getConfirmationEmailActionPrompt(notice), /再試行/);
});

test("keeps the API retry window for a transient provider failure", () => {
  const notice = getConfirmationEmailNotice(false, {
    ok: false,
    sent: false,
    retryable: true,
    retryWindowHours: 12,
    retryToken: "reservation-confirmed-email/reservation-1/0123456789abcdef0123456789abcdef",
    message: "12時間以内に再試行できます。",
  });

  assert.equal(notice.canRetry, true);
  assert.equal(notice.completed, false);
  assert.equal(notice.retryWindowHours, 12);
  assert.equal(notice.message, "12時間以内に再試行できます。");
  assert.match(notice.retryToken, /^reservation-confirmed-email\//);
});

test("clears retry after a successful send or intentional skip", () => {
  for (const result of [
    { ok: true, sent: true, message: "送信しました。" },
    { ok: true, sent: false, message: "メール未登録のため送信していません。" },
  ]) {
    const notice = getConfirmationEmailNotice(true, result);
    assert.equal(notice.canRetry, false);
    assert.equal(notice.completed, true);
    assert.equal(notice.retryWindowHours, null);
    assert.equal(notice.expiresAt, null);
    assert.equal(notice.message, result.message);
  }
});

test("does not offer retry after a permanent provider rejection", () => {
  const notice = getConfirmationEmailNotice(false, {
    ok: false,
    sent: false,
    retryable: false,
    message: "メール通知に失敗しました。",
  });

  assert.equal(notice.canRetry, false);
  assert.equal(notice.completed, false);
  assert.equal(notice.retryWindowHours, null);
  assert.equal(notice.expiresAt, null);
});

test("expires an open-tab retry at the original provider deadline", () => {
  const startedAt = 1_000_000;
  const initial = getConfirmationEmailNotice(
    false,
    {
      ok: false,
      retryable: true,
      retryWindowHours: 24,
      retryToken: "reservation-confirmed-email/reservation-1/0123456789abcdef0123456789abcdef",
    },
    startedAt
  );

  assert.equal(
    isConfirmationEmailRetryActive(initial, initial.expiresAt - 1),
    true
  );
  assert.equal(
    isConfirmationEmailRetryActive(initial, initial.expiresAt),
    false
  );

  const retried = getConfirmationEmailNotice(
    false,
    { ok: false, retryable: true, retryWindowHours: 24 },
    startedAt + 60 * 60 * 1000,
    initial.expiresAt
  );
  assert.equal(retried.expiresAt, initial.expiresAt);

  const expired = getExpiredConfirmationEmailNotice();
  assert.equal(expired.canRetry, false);
  assert.match(expired.message, /送信履歴を確認/);

  const expiredRecovery = getExpiredConfirmationEmailNotice(
    "確定メールを送信"
  );
  assert.match(expiredRecovery.message, /安全に送信できる期限/);
  assert.match(expiredRecovery.message, /送信せず/);
  assert.doesNotMatch(expiredRecovery.message, /再送せず/);
});

test("restores a safe email retry after reload without extending its deadline", () => {
  const storage = createMemoryStorage();
  const startedAt = 2_000_000;
  const notice = getConfirmationEmailNotice(
    false,
    { ok: false, retryable: true, retryWindowHours: 24 },
    startedAt,
    null,
    "123e4567-e89b-42d3-a456-426614174000"
  );

  saveConfirmationEmailRetryNotice(
    storage,
    "reservation-1",
    notice,
    startedAt
  );

  const restored = readConfirmationEmailRetryNotice(
    storage,
    "reservation-1",
    startedAt + 2 * 60 * 60 * 1000
  );
  assert.equal(restored?.canRetry, true);
  assert.equal(restored?.actionLabel, "確定メールを再試行");
  assert.equal(restored?.expiresAt, notice.expiresAt);
  assert.equal(restored?.retryWindowHours, 22);
  assert.equal(restored?.retryToken, notice.retryToken);
  assert.equal(restored?.attemptId, notice.attemptId);
});

test("creates a lowercase UUID for one browser email attempt", () => {
  const attemptId = createConfirmationEmailAttemptId({
    randomUUID() {
      return "123E4567-E89B-42D3-A456-426614174000";
    },
    getRandomValues() {
      throw new Error("randomUUID should be preferred");
    },
  });

  assert.equal(attemptId, "123e4567-e89b-42d3-a456-426614174000");
});

test("creates a valid UUID when randomUUID is unavailable", () => {
  const attemptId = createConfirmationEmailAttemptId(undefined);

  assert.match(
    attemptId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

test("blocks a second confirmation email attempt while delivery is in progress", () => {
  const storage = createMemoryStorage();
  const startedAt = 4_000_000;
  const attemptId = "123e4567-e89b-42d3-a456-426614174000";
  const lock = getConfirmationEmailInProgressLock(attemptId, startedAt);

  assert.equal(lock.attemptId, attemptId);
  assert.equal(
    lock.retryAt,
    startedAt + CONFIRMATION_EMAIL_IN_PROGRESS_LOCK_TTL_MS
  );
  assert.match(lock.message, /送信処理が進行中/);

  saveConfirmationEmailInProgressLock(
    storage,
    "reservation-1",
    lock,
    startedAt
  );
  const restored = readConfirmationEmailInProgressLock(
    storage,
    "reservation-1",
    startedAt + CONFIRMATION_EMAIL_IN_PROGRESS_LOCK_TTL_MS - 1
  );
  assert.equal(restored?.attemptId, attemptId);
  assert.equal(restored?.retryAt, lock.retryAt);

  const notice = getConfirmationEmailInProgressNotice(restored);
  assert.equal(notice.canRetry, false);
  assert.equal(notice.completed, false);
  assert.equal(notice.expiresAt, lock.retryAt);
  assert.match(notice.message, /5分後/);

  assert.equal(
    readConfirmationEmailInProgressLock(
      storage,
      "reservation-1",
      startedAt + CONFIRMATION_EMAIL_IN_PROGRESS_LOCK_TTL_MS
    ),
    null
  );
});

test("display notice follows a cross-tab send lock and restores its retry", () => {
  const storage = createMemoryStorage();
  const startedAt = 5_000_000;
  const attemptId = "123e4567-e89b-42d3-a456-426614174000";
  const retryNotice = getConfirmationEmailNotice(
    false,
    null,
    startedAt,
    null,
    attemptId
  );
  saveConfirmationEmailRetryNotice(
    storage,
    "reservation-1",
    retryNotice,
    startedAt
  );

  const lockStartedAt = startedAt + 1_000;
  const lock = getConfirmationEmailInProgressLock(attemptId, lockStartedAt);
  saveConfirmationEmailInProgressLock(
    storage,
    "reservation-1",
    lock,
    lockStartedAt
  );

  const inProgressNotice = readConfirmationEmailDisplayNotice(
    storage,
    "reservation-1",
    lockStartedAt + 1
  );
  assert.equal(inProgressNotice?.canRetry, false);
  assert.equal(inProgressNotice?.expiresAt, lock.retryAt);

  const restoredRetry = readConfirmationEmailDisplayNotice(
    storage,
    "reservation-1",
    lock.retryAt
  );
  assert.equal(restoredRetry?.canRetry, true);
  assert.equal(restoredRetry?.attemptId, attemptId);
  assert.equal(restoredRetry?.expiresAt, retryNotice.expiresAt);
});

test("confirmation email claim proceeds only for the tab that still owns the lock", async () => {
  const storage = createMemoryStorage();
  const now = Date.now();
  const attemptId = "123e4567-e89b-42d3-a456-426614174000";
  const firstOwnerId = "11111111-1111-4111-8111-111111111111";
  const secondOwnerId = "22222222-2222-4222-8222-222222222222";
  let releaseClaim;

  const firstClaim = claimConfirmationEmailInProgressLock(
    storage,
    "reservation-1",
    attemptId,
    firstOwnerId,
    now,
    () =>
      new Promise((resolve) => {
        releaseClaim = resolve;
      })
  );
  saveConfirmationEmailInProgressLock(
    storage,
    "reservation-1",
    getConfirmationEmailInProgressLock(attemptId, now, secondOwnerId),
    now
  );
  releaseClaim();

  const result = await firstClaim;
  assert.equal(result.acquired, false);
  assert.equal(result.lock.attemptId, attemptId);
  assert.equal(result.lock.ownerId, secondOwnerId);
});

test("confirmation email claim keeps the current-screen guard when storage is unavailable", async () => {
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
  const attemptId = "123e4567-e89b-42d3-a456-426614174000";
  const ownerId = "33333333-3333-4333-8333-333333333333";
  const result = await claimConfirmationEmailInProgressLock(
    unavailableStorage,
    "reservation-1",
    attemptId,
    ownerId,
    1_000,
    async () => {}
  );

  assert.equal(result.acquired, true);
  assert.equal(result.lock.attemptId, attemptId);
  assert.equal(result.lock.ownerId, ownerId);
});

test("clears a known confirmation email result lock but keeps an unknown result lock", () => {
  const listSource = readFileSync(
    new URL("../app/reservations/ReservationsPageClient.tsx", import.meta.url),
    "utf8"
  );
  const editSource = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  for (const source of [listSource, editSource]) {
    const functionStart = source.indexOf(
      source.includes("sendReservationConfirmedEmail")
        ? "async function sendReservationConfirmedEmail"
        : "async function sendConfirmationEmailNotice"
    );
    const functionEnd = source.indexOf("\n  async function ", functionStart + 20);
    const sendFunction = source.slice(functionStart, functionEnd);
    const claimIndex = sendFunction.indexOf(
      "claimConfirmationEmailInProgressLock"
    );
    const ownerIndex = sendFunction.indexOf(
      "if (!claim.acquired)",
      claimIndex
    );
    const fetchIndex = sendFunction.indexOf(
      "requestConfirmationEmailWithTimeout("
    );

    assert.ok(claimIndex >= 0 && ownerIndex > claimIndex);
    assert.ok(fetchIndex > ownerIndex);
    assert.match(
      sendFunction,
      /if \(result\) \{[\s\S]{0,120}saveConfirmationEmailInProgressLock\([\s\S]{0,100}null/
    );
    assert.doesNotMatch(
      sendFunction,
      /catch \(error\)[\s\S]{0,180}saveConfirmationEmailInProgressLock/
    );
  }
});

test("clears completed, expired, and malformed stored email retries", () => {
  const storage = createMemoryStorage();
  const startedAt = 3_000_000;
  const notice = getConfirmationEmailRecoveryNotice(startedAt);

  saveConfirmationEmailRetryNotice(
    storage,
    "reservation-2",
    notice,
    startedAt
  );
  assert.equal(
    readConfirmationEmailRetryNotice(
      storage,
      "reservation-2",
      notice.expiresAt
    ),
    null
  );

  saveConfirmationEmailRetryNotice(
    storage,
    "reservation-3",
    notice,
    startedAt
  );
  saveConfirmationEmailRetryNotice(storage, "reservation-3", null, startedAt);
  assert.equal(
    readConfirmationEmailRetryNotice(storage, "reservation-3", startedAt),
    null
  );

  storage.setItem(
    "aily:confirmation-email-retry:v1:reservation-4",
    "not-json"
  );
  assert.equal(
    readConfirmationEmailRetryNotice(storage, "reservation-4", startedAt),
    null
  );
});

test("reservation screens restore and persist email retry recovery", () => {
  const listSource = readFileSync(
    new URL("../app/reservations/ReservationsPageClient.tsx", import.meta.url),
    "utf8"
  );
  const editSource = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  for (const source of [listSource, editSource]) {
    assert.match(source, /readConfirmationEmailRetryNotice\(/);
    assert.match(source, /requestConfirmationEmailWithTimeout\(/);
    assert.match(source, /saveConfirmationEmailRetryNotice\(/);
    assert.match(source, /expectedIdempotencyKey: retryToken/);
    assert.match(source, /retryNotice(?:\?|)\.retryToken/);
    assert.match(source, /createConfirmationEmailAttemptId\(\)/);
    assert.match(source, /retryNotice(?:\?|)\.attemptId/);
    assert.match(source, /attemptId,/);
    assert.match(source, /readConfirmationEmailInProgressLock\(/);
    assert.match(source, /readConfirmationEmailDisplayNotice\(/);
    assert.match(source, /saveConfirmationEmailInProgressLock\(/);
    assert.match(source, /claimConfirmationEmailInProgressLock\(/);
    assert.match(source, /getConfirmationEmailInProgressNotice\(/);
    assert.match(source, /addEventListener\("storage",[\s\S]{0,100}ConfirmationEmail/);
    assert.match(source, /removeEventListener\([\s\S]{0,100}"storage",[\s\S]{0,100}ConfirmationEmail/);
    assert.match(source, /confirmationEmailRefreshAt[\s\S]{0,260}setTimeout/);
  }
  assert.match(
    listSource,
    /for \(const reservation of fetchedReservations\)[\s\S]{0,260}readConfirmationEmailDisplayNotice/
  );
  assert.match(
    editSource,
    /setConfirmationEmailRetryNotice\([\s\S]{0,220}readConfirmationEmailDisplayNotice/
  );
});
