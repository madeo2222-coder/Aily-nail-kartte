export type ConfirmationLineApiResult = {
  ok?: boolean;
  sent?: boolean;
  alreadySent?: boolean;
  retried?: boolean;
  retryable?: boolean;
  status?: string;
  retryAfterSeconds?: number;
  error?: string;
  message?: string;
};

export type ConfirmationLineRetryLock = {
  kind: "sent" | "history_check";
  message: string;
};

export type AlternativeLineApiResult = ConfirmationLineApiResult;
export type AlternativeLineRetryLock =
  | ConfirmationLineRetryLock
  | {
      kind: "wait";
      message: string;
      retryAt: number;
    };

export type AlternativeLineReservationSnapshot = {
  customerId: string | null;
  staffId: string | null;
  menu: string | null;
  startAt: string | null;
  endAt: string | null;
  status: string | null;
  memo: string | null;
};

type RetryLockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredConfirmationLineRetryLock = {
  version: 1;
  savedAt: number;
  kind: ConfirmationLineRetryLock["kind"];
};

type StoredAlternativeLineRetryLock = {
  version: 2;
  savedAt: number;
  kind: AlternativeLineRetryLock["kind"];
  reservationRevision: string;
};

export const CONFIRMATION_LINE_RETRY_LOCK_TTL_MS = 23 * 60 * 60 * 1000;
export const ALTERNATIVE_LINE_RETRY_LOCK_TTL_MS =
  CONFIRMATION_LINE_RETRY_LOCK_TTL_MS;
export const ALTERNATIVE_LINE_IN_PROGRESS_LOCK_TTL_MS = 5 * 60 * 1000;

const STORAGE_KEY_PREFIX = "aily:confirmation-line-retry-lock:v1:";
const ALTERNATIVE_STORAGE_KEY_PREFIX =
  "aily:alternative-line-retry-lock:v2:";
const LEGACY_ALTERNATIVE_STORAGE_KEY_PREFIX =
  "aily:alternative-line-retry-lock:v1:";
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

function getStorageKey(prefix: string, reservationId: string) {
  return `${prefix}${reservationId}`;
}

function isRetryLockKind(
  value: unknown
): value is ConfirmationLineRetryLock["kind"] {
  return value === "sent" || value === "history_check";
}

function isAlternativeRetryLockKind(
  value: unknown
): value is AlternativeLineRetryLock["kind"] {
  return isRetryLockKind(value) || value === "wait";
}

function hashRevisionPart(value: string, seed: number) {
  let hash = seed >>> 0;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createAlternativeLineReservationRevision(
  snapshot: AlternativeLineReservationSnapshot
) {
  const serialized = JSON.stringify([
    snapshot.customerId,
    snapshot.staffId,
    snapshot.menu,
    snapshot.startAt,
    snapshot.endAt,
    snapshot.status,
    snapshot.memo,
  ]);

  return `v1:${serialized.length}:${hashRevisionPart(
    serialized,
    2166136261
  )}${hashRevisionPart(serialized, 2654435769)}`;
}

export function readConfirmationLineRetryLock(
  storage: RetryLockStorage,
  reservationId: string,
  now = Date.now()
): ConfirmationLineRetryLock | null {
  return readLineRetryLock(
    storage,
    STORAGE_KEY_PREFIX,
    STORED_LOCK_MESSAGES,
    reservationId,
    now
  );
}

function readLineRetryLock(
  storage: RetryLockStorage,
  prefix: string,
  messages: Record<ConfirmationLineRetryLock["kind"], string>,
  reservationId: string,
  now: number
): ConfirmationLineRetryLock | null {
  const key = getStorageKey(prefix, reservationId);

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
      ? { kind: stored.kind, message: messages[stored.kind] }
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
  saveLineRetryLock(storage, STORAGE_KEY_PREFIX, reservationId, lock, now);
}

function saveLineRetryLock(
  storage: RetryLockStorage,
  prefix: string,
  reservationId: string,
  lock: ConfirmationLineRetryLock | null,
  now: number
) {
  const key = getStorageKey(prefix, reservationId);

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

const ALTERNATIVE_STORED_LOCK_MESSAGES: Record<
  AlternativeLineRetryLock["kind"],
  string
> = {
  sent: "別日時入力のLINEは送信済みです。重複送信していません。",
  history_check:
    "別日時入力LINEの結果を確認できません。同じ送信を繰り返さず、通知状態とLINEの送信履歴を確認してください。",
  wait: "別の送信処理が進行中です。5分後にもう一度確認できます。",
};

export function readAlternativeLineRetryLock(
  storage: RetryLockStorage,
  reservationId: string,
  reservationRevision: string,
  now = Date.now()
): AlternativeLineRetryLock | null {
  const key = getStorageKey(ALTERNATIVE_STORAGE_KEY_PREFIX, reservationId);
  const legacyKey = getStorageKey(
    LEGACY_ALTERNATIVE_STORAGE_KEY_PREFIX,
    reservationId
  );

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      const legacyRaw = storage.getItem(legacyKey);
      if (!legacyRaw) return null;

      const legacy = JSON.parse(
        legacyRaw
      ) as Partial<StoredConfirmationLineRetryLock>;
      const legacyIsValid =
        legacy.version === 1 &&
        typeof legacy.savedAt === "number" &&
        Number.isFinite(legacy.savedAt) &&
        legacy.savedAt <= now &&
        now - legacy.savedAt < ALTERNATIVE_LINE_RETRY_LOCK_TTL_MS &&
        isRetryLockKind(legacy.kind) &&
        Boolean(reservationRevision);

      if (!legacyIsValid || !legacy.kind || legacy.savedAt === undefined) {
        storage.removeItem(legacyKey);
        return null;
      }

      const migrated: StoredAlternativeLineRetryLock = {
        version: 2,
        savedAt: legacy.savedAt,
        kind: legacy.kind,
        reservationRevision,
      };
      storage.setItem(key, JSON.stringify(migrated));
      storage.removeItem(legacyKey);
      return {
        kind: legacy.kind,
        message: ALTERNATIVE_STORED_LOCK_MESSAGES[legacy.kind],
      };
    }

    const stored = JSON.parse(raw) as Partial<StoredAlternativeLineRetryLock>;
    const lockTtl =
      stored.kind === "wait"
        ? ALTERNATIVE_LINE_IN_PROGRESS_LOCK_TTL_MS
        : ALTERNATIVE_LINE_RETRY_LOCK_TTL_MS;
    const isValid =
      stored.version === 2 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt < lockTtl &&
      isAlternativeRetryLockKind(stored.kind) &&
      typeof stored.reservationRevision === "string" &&
      Boolean(reservationRevision) &&
      stored.reservationRevision === reservationRevision;

    if (!isValid) {
      storage.removeItem(key);
      return null;
    }

    if (stored.kind === "wait" && typeof stored.savedAt === "number") {
      return {
        kind: "wait",
        message: ALTERNATIVE_STORED_LOCK_MESSAGES.wait,
        retryAt: stored.savedAt + ALTERNATIVE_LINE_IN_PROGRESS_LOCK_TTL_MS,
      };
    }

    if (stored.kind === "sent" || stored.kind === "history_check") {
      return {
        kind: stored.kind,
        message: ALTERNATIVE_STORED_LOCK_MESSAGES[stored.kind],
      };
    }

    return null;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage access can be unavailable in privacy-restricted browsers.
    }
    return null;
  }
}

export function saveAlternativeLineRetryLock(
  storage: RetryLockStorage,
  reservationId: string,
  reservationRevision: string,
  lock: AlternativeLineRetryLock | null,
  now = Date.now()
) {
  const key = getStorageKey(ALTERNATIVE_STORAGE_KEY_PREFIX, reservationId);

  try {
    storage.removeItem(
      getStorageKey(LEGACY_ALTERNATIVE_STORAGE_KEY_PREFIX, reservationId)
    );
    if (!lock || !reservationRevision) {
      storage.removeItem(key);
      return;
    }

    const stored: StoredAlternativeLineRetryLock = {
      version: 2,
      savedAt: now,
      kind: lock.kind,
      reservationRevision,
    };
    storage.setItem(key, JSON.stringify(stored));
  } catch {
    // The in-memory lock still protects the current screen when storage fails.
  }
}

export function getAlternativeLineRetryLock(
  result: AlternativeLineApiResult | null,
  now = Date.now()
): AlternativeLineRetryLock | null {
  if (result?.status === "in_progress") {
    return {
      kind: "wait",
      message:
        result.error ||
        result.message ||
        "別の送信処理が進行中です。5分後にもう一度確認できます。",
      retryAt: now + ALTERNATIVE_LINE_IN_PROGRESS_LOCK_TTL_MS,
    };
  }

  const lock = getConfirmationLineRetryLock(result);
  if (!lock) return null;

  if (lock.kind === "sent") {
    return {
      kind: "sent",
      message:
        result?.message ||
        (result?.alreadySent
          ? "別日時入力のLINEは送信済みです。重複送信していません。"
          : "別日時入力のLINEを送信しました。"),
    };
  }

  return {
    kind: "history_check",
    message:
      result?.error ||
      result?.message ||
      ALTERNATIVE_STORED_LOCK_MESSAGES.history_check,
  };
}
