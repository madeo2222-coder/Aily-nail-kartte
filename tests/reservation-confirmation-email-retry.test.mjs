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

const { getConfirmationEmailNotice } = exports;

test("enables a same-screen retry when the confirmation email response is lost", () => {
  const notice = getConfirmationEmailNotice(false, null);

  assert.equal(notice.canRetry, true);
  assert.equal(notice.completed, false);
  assert.equal(notice.retryWindowHours, 24);
  assert.match(notice.message, /24時間以内/);
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
});
