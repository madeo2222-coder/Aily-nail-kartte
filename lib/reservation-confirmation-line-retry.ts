export type ConfirmationLineApiResult = {
  ok?: boolean;
  sent?: boolean;
  alreadySent?: boolean;
  retried?: boolean;
  retryable?: boolean;
  status?: string;
  error?: string;
  message?: string;
};

export type ConfirmationLineRetryLock = {
  kind: "sent" | "history_check";
  message: string;
};

const HISTORY_CHECK_STATUSES = new Set([
  "unknown",
  "sent_unrecorded",
  "retry_expired",
  "message_changed",
]);

export function getConfirmationLineRetryLock(
  result: ConfirmationLineApiResult | null
): ConfirmationLineRetryLock | null {
  if (!result) {
    return {
      kind: "history_check",
      message:
        "LINE通知の結果を確認できません。同じ送信を繰り返さず、通知状態とLINEの送信履歴を確認してください。",
    };
  }

  if (
    result.retryable === false ||
    (result.status ? HISTORY_CHECK_STATUSES.has(result.status) : false)
  ) {
    return {
      kind: "history_check",
      message:
        result.error ||
        result.message ||
        "LINE通知の結果を確認できません。同じ送信を繰り返さず、通知状態とLINEの送信履歴を確認してください。",
    };
  }

  if (result.sent || result.alreadySent) {
    return {
      kind: "sent",
      message:
        result.message ||
        (result.alreadySent
          ? "予約確定LINEは送信済みです。重複送信していません。"
          : "予約確定LINEを送信しました。"),
    };
  }

  return null;
}
