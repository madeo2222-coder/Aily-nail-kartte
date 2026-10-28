export type ConfirmationEmailApiResult = {
  ok?: boolean;
  sent?: boolean;
  retryable?: boolean;
  retryWindowHours?: number;
  message?: string;
};

export type ConfirmationEmailNotice = {
  message: string;
  canRetry: boolean;
  completed: boolean;
  retryWindowHours: number | null;
};

const DEFAULT_RETRY_WINDOW_HOURS = 24;

export function getConfirmationEmailNotice(
  responseOk: boolean,
  result: ConfirmationEmailApiResult | null
): ConfirmationEmailNotice {
  if (!result) {
    return {
      message:
        "メール通知の送信結果を確認できませんでした。予約は確定済みです。同じ画面から24時間以内に再試行できます。",
      canRetry: true,
      completed: false,
      retryWindowHours: DEFAULT_RETRY_WINDOW_HOURS,
    };
  }

  if (responseOk && result.ok) {
    return {
      message:
        result.message ||
        (result.sent
          ? "予約確定メールを送信しました。"
          : "予約確定メールは送信されませんでした。"),
      canRetry: false,
      completed: true,
      retryWindowHours: null,
    };
  }

  const canRetry = result.retryable === true;
  const retryWindowHours = canRetry
    ? result.retryWindowHours || DEFAULT_RETRY_WINDOW_HOURS
    : null;

  return {
    message:
      result.message ||
      (canRetry
        ? `メール通知の送信結果を確認できませんでした。同じ画面から${retryWindowHours}時間以内に再試行できます。`
        : "メール通知に失敗しました。予約は確定済みです。"),
    canRetry,
    completed: false,
    retryWindowHours,
  };
}
