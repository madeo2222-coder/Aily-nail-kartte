export type ConfirmationEmailApiResult = {
  ok?: boolean;
  sent?: boolean;
  retryable?: boolean;
  retryWindowHours?: number;
  retryToken?: string;
  message?: string;
};

export type ConfirmationEmailNotice = {
  message: string;
  canRetry: boolean;
  completed: boolean;
  retryWindowHours: number | null;
  expiresAt: number | null;
  retryToken?: string;
  actionLabel?: "確定メールを送信" | "確定メールを再試行";
};

const DEFAULT_RETRY_WINDOW_HOURS = 24;
const STORAGE_KEY_PREFIX = "aily:confirmation-email-retry:v1:";

type RetryNoticeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredConfirmationEmailRetryNotice = {
  version: 1;
  savedAt: number;
  message: string;
  expiresAt: number;
  actionLabel: NonNullable<ConfirmationEmailNotice["actionLabel"]>;
  retryToken?: string;
};

function getStorageKey(reservationId: string) {
  return `${STORAGE_KEY_PREFIX}${reservationId}`;
}

function isActionLabel(
  value: unknown
): value is NonNullable<ConfirmationEmailNotice["actionLabel"]> {
  return value === "確定メールを送信" || value === "確定メールを再試行";
}

export function readConfirmationEmailRetryNotice(
  storage: RetryNoticeStorage,
  reservationId: string,
  now = Date.now()
): ConfirmationEmailNotice | null {
  const key = getStorageKey(reservationId);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredConfirmationEmailRetryNotice>;
    const isValid =
      stored.version === 1 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      typeof stored.message === "string" &&
      stored.message.trim().length > 0 &&
      typeof stored.expiresAt === "number" &&
      Number.isFinite(stored.expiresAt) &&
      now < stored.expiresAt &&
      isActionLabel(stored.actionLabel);
    const retryToken =
      typeof stored.retryToken === "string" && stored.retryToken.trim()
        ? stored.retryToken.trim()
        : undefined;

    if (!isValid) {
      storage.removeItem(key);
      return null;
    }

    const message = stored.message as string;
    const expiresAt = stored.expiresAt as number;
    const actionLabel = stored.actionLabel as NonNullable<
      ConfirmationEmailNotice["actionLabel"]
    >;
    const retryWindowHours = Math.max(
      1,
      Math.ceil((expiresAt - now) / (60 * 60 * 1000))
    );

    return {
      message,
      canRetry: true,
      completed: false,
      retryWindowHours,
      expiresAt,
      actionLabel,
      retryToken,
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage access can be unavailable in privacy-restricted browsers.
    }
    return null;
  }
}

export function saveConfirmationEmailRetryNotice(
  storage: RetryNoticeStorage,
  reservationId: string,
  notice: ConfirmationEmailNotice | null,
  now = Date.now()
) {
  const key = getStorageKey(reservationId);

  try {
    if (
      !notice?.canRetry ||
      notice.expiresAt === null ||
      notice.expiresAt <= now ||
      !isActionLabel(notice.actionLabel)
    ) {
      storage.removeItem(key);
      return;
    }

    const stored: StoredConfirmationEmailRetryNotice = {
      version: 1,
      savedAt: now,
      message: notice.message,
      expiresAt: notice.expiresAt,
      actionLabel: notice.actionLabel,
      ...(notice.retryToken ? { retryToken: notice.retryToken } : {}),
    };
    storage.setItem(key, JSON.stringify(stored));
  } catch {
    // The in-memory retry notice still protects the current screen.
  }
}

export function getConfirmationEmailRecoveryNotice(
  now = Date.now(),
  previousExpiresAt: number | null = null
): ConfirmationEmailNotice {
  return {
    message:
      "予約確定の通信結果を確認できませんでした。最新情報で確定済みと確認できた場合は、同じ画面から24時間以内に確定メールを送信できます。",
    canRetry: true,
    completed: false,
    retryWindowHours: DEFAULT_RETRY_WINDOW_HOURS,
    expiresAt: getRetryExpiresAt(
      now,
      DEFAULT_RETRY_WINDOW_HOURS,
      previousExpiresAt
    ),
    actionLabel: "確定メールを送信",
  };
}

export function getConfirmationEmailNotice(
  responseOk: boolean,
  result: ConfirmationEmailApiResult | null,
  now = Date.now(),
  previousExpiresAt: number | null = null
): ConfirmationEmailNotice {
  if (!result) {
    const expiresAt = getRetryExpiresAt(
      now,
      DEFAULT_RETRY_WINDOW_HOURS,
      previousExpiresAt
    );
    return {
      message:
        "メール通知の送信結果を確認できませんでした。予約は確定済みです。同じ画面から24時間以内に再試行できます。",
      canRetry: true,
      completed: false,
      retryWindowHours: DEFAULT_RETRY_WINDOW_HOURS,
      expiresAt,
      actionLabel: "確定メールを再試行",
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
      expiresAt: null,
    };
  }

  const canRetry = result.retryable === true;
  const retryWindowHours = canRetry
    ? result.retryWindowHours || DEFAULT_RETRY_WINDOW_HOURS
    : null;
  const expiresAt = retryWindowHours
    ? getRetryExpiresAt(now, retryWindowHours, previousExpiresAt)
    : null;

  if (canRetry && expiresAt !== null && expiresAt <= now) {
    return getExpiredConfirmationEmailNotice();
  }

  return {
    message:
      result.message ||
      (canRetry
        ? `メール通知の送信結果を確認できませんでした。同じ画面から${retryWindowHours}時間以内に再試行できます。`
        : "メール通知に失敗しました。予約は確定済みです。"),
    canRetry,
    completed: false,
    retryWindowHours,
    expiresAt,
    actionLabel: canRetry ? "確定メールを再試行" : undefined,
    retryToken:
      canRetry && typeof result.retryToken === "string"
        ? result.retryToken
        : undefined,
  };
}

function getRetryExpiresAt(
  now: number,
  retryWindowHours: number,
  previousExpiresAt: number | null
) {
  const candidate = now + retryWindowHours * 60 * 60 * 1000;
  return previousExpiresAt === null
    ? candidate
    : Math.min(previousExpiresAt, candidate);
}

export function isConfirmationEmailRetryActive(
  notice: ConfirmationEmailNotice | null | undefined,
  now = Date.now()
) {
  return Boolean(
    notice?.canRetry &&
      notice.expiresAt !== null &&
      now < notice.expiresAt
  );
}

export function getConfirmationEmailActionPrompt(
  notice: ConfirmationEmailNotice | null | undefined
) {
  return notice?.actionLabel === "確定メールを送信"
    ? "最新情報で確定済みと確認した予約に、確定メールを送信しますか？送信記録がある場合は重複送信しません。"
    : "予約確定メールを再試行しますか？24時間以内は同じ予約内容の重複送信を防ぎます。";
}

export function getExpiredConfirmationEmailNotice(
  actionLabel: ConfirmationEmailNotice["actionLabel"] =
    "確定メールを再試行"
): ConfirmationEmailNotice {
  return {
    message:
      actionLabel === "確定メールを送信"
        ? "予約確定メールを安全に送信できる期限を過ぎました。送信せず、メールの送信履歴を確認してください。"
        : "予約確定メールの安全な再試行期限を過ぎました。再送せず、メールの送信履歴を確認してください。",
    canRetry: false,
    completed: false,
    retryWindowHours: null,
    expiresAt: null,
  };
}
