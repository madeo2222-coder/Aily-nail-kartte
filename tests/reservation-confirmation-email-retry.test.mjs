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
  { exports }
);

const {
  createConfirmationEmailAttemptId,
  getConfirmationEmailActionPrompt,
  getConfirmationEmailRecoveryNotice,
  getConfirmationEmailNotice,
  getExpiredConfirmationEmailNotice,
  isConfirmationEmailRetryActive,
  readConfirmationEmailRetryNotice,
  saveConfirmationEmailRetryNotice,
} = exports;

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
    assert.match(source, /saveConfirmationEmailRetryNotice\(/);
    assert.match(source, /expectedIdempotencyKey: retryToken/);
    assert.match(source, /retryNotice(?:\?|)\.retryToken/);
    assert.match(source, /createConfirmationEmailAttemptId\(\)/);
    assert.match(source, /retryNotice(?:\?|)\.attemptId/);
    assert.match(source, /attemptId,/);
  }
  assert.match(
    listSource,
    /for \(const reservation of fetchedReservations\)[\s\S]{0,260}readConfirmationEmailRetryNotice/
  );
  assert.match(
    editSource,
    /setConfirmationEmailRetryNotice\([\s\S]{0,220}readConfirmationEmailRetryNotice/
  );
});
