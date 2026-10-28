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
  getConfirmationEmailActionPrompt,
  getConfirmationEmailRecoveryNotice,
  getConfirmationEmailNotice,
  getExpiredConfirmationEmailNotice,
  isConfirmationEmailRetryActive,
} = exports;

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
  const notice = getConfirmationEmailNotice(false, null, startedAt);

  assert.equal(notice.canRetry, true);
  assert.equal(notice.completed, false);
  assert.equal(notice.retryWindowHours, 24);
  assert.equal(notice.expiresAt, startedAt + 24 * 60 * 60 * 1000);
  assert.match(notice.message, /24時間以内/);
  assert.match(getConfirmationEmailActionPrompt(notice), /再試行/);
});

test("keeps the API retry window for a transient provider failure", () => {
  const notice = getConfirmationEmailNotice(false, {
    ok: false,
    sent: false,
    retryable: true,
    retryWindowHours: 12,
    message: "12時間以内に再試行できます。",
  });

  assert.equal(notice.canRetry, true);
  assert.equal(notice.completed, false);
  assert.equal(notice.retryWindowHours, 12);
  assert.equal(notice.message, "12時間以内に再試行できます。");
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
    { ok: false, retryable: true, retryWindowHours: 24 },
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
