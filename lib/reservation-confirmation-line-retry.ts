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

type RetryLockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredConfirmationLineRetryLock = {
  version: 1;
  savedAt: number;
  kind: ConfirmationLineRetryLock["kind"];
};

export const CONFIRMATION_LINE_RETRY_LOCK_TTL_MS = 23 * 60 * 60 * 1000;

const STORAGE_KEY_PREFIX = "aily:confirmation-line-retry-lock:v1:";
const STORED_LOCK_MESSAGES: Record<
  ConfirmationLineRetryLock["kind"],
  string
> = {
  sent: "予約確定LINEは送信済みです。重複送信していません。",
  history_check:
    "LINE通知の結果を確認できません。同じ送信を繰り返さず、通知状態とLINEの送信履歴を確認してください。",
};

const HISTORY_CHECK_STATUSES = new Set([
  "unknown",
  "sent_unrecorded",
  "retry_expired",
  "message_changed",
]);

function getStorageKey(reservationId: string) {
  return `${STORAGE_KEY_PREFIX}${reservationId}`;
}

function isRetryLockKind(
  value: unknown
): value is ConfirmationLineRetryLock["kind"] {
  return value === "sent" || value === "history_check";
}

export function readConfirmationLineRetryLock(
  storage: RetryLockStorage,
  reservationId: string,
  now = Date.now()
): ConfirmationLineRetryLock | null {
  const key = getStorageKey(reservationId);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredConfirmationLineRetryLock>;
    const isValid =
      stored.version === 1 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt < CONFIRMATION_LINE_RETRY_LOCK_TTL_MS &&
      isRetryLockKind(stored.kind);

    if (!isValid) {
      storage.removeItem(key);
      return null;
    }

    return stored.kind
      ? { kind: stored.kind, message: STORED_LOCK_MESSAGES[stored.kind] }
      : null;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage access can be unavailable in privacy-restricted browsers.
    }
    return null;
  }
}

export function saveConfirmationLineRetryLock(
  storage: RetryLockStorage,
  reservationId: string,
  lock: ConfirmationLineRetryLock | null,
  now = Date.now()
) {
  const key = getStorageKey(reservationId);

  try {
    if (!lock) {
      storage.removeItem(key);
      return;
    }

    const stored: StoredConfirmationLineRetryLock = {
      version: 1,
      savedAt: now,
      kind: lock.kind,
    };
    storage.setItem(key, JSON.stringify(stored));
  } catch {
    // The in-memory lock still protects the current screen when storage fails.
  }
}

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
