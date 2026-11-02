export type ConfirmationLineApiResult = {
  ok?: boolean;
  sent?: boolean;
  alreadySent?: boolean;
  retried?: boolean;
  retryable?: boolean;
  status?: string;
  errorCode?: string;
  retryAfterSeconds?: number;
  error?: string;
  message?: string;
};

export type ConfirmationLineRetryLock =
  | {
      kind: "sent" | "history_check";
      message: string;
    }
  | {
      kind: "wait";
      message: string;
      retryAt: number;
      attemptId?: string;
    };

export type AlternativeLineApiResult = ConfirmationLineApiResult;
export type AlternativeLineRetryLock = ConfirmationLineRetryLock;

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
  attemptId?: string;
};

type StoredAlternativeLineRetryLock = {
  version: 2;
  savedAt: number;
  kind: AlternativeLineRetryLock["kind"];
  reservationRevision: string;
  attemptId?: string;
};

export const CONFIRMATION_LINE_RETRY_LOCK_TTL_MS = 23 * 60 * 60 * 1000;
export const CONFIRMATION_LINE_IN_PROGRESS_LOCK_TTL_MS = 5 * 60 * 1000;
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
  wait:
    "予約確定LINEの送信処理が進行中です。5分後にこの画面から再試行できます。",
};

const HISTORY_CHECK_STATUSES = new Set([
  "unknown",
  "sent_unrecorded",
  "retry_expired",
  "message_changed",
]);

const CONFIRMATION_LINE_ATTEMPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeConfirmationLineAttemptId(value: unknown) {
  return typeof value === "string" &&
    CONFIRMATION_LINE_ATTEMPT_ID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : undefined;
}

export function createConfirmationLineAttemptId(
  cryptoApi: Pick<Crypto, "randomUUID" | "getRandomValues"> | undefined =
    globalThis.crypto
) {
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID().toLowerCase();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getStorageKey(prefix: string, reservationId: string) {
  return `${prefix}${reservationId}`;
}

function isTerminalRetryLockKind(
  value: unknown
): value is "sent" | "history_check" {
  return value === "sent" || value === "history_check";
}

function isRetryLockKind(
  value: unknown
): value is ConfirmationLineRetryLock["kind"] {
  return isTerminalRetryLockKind(value) || value === "wait";
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
    const lockTtl =
      stored.kind === "wait"
        ? CONFIRMATION_LINE_IN_PROGRESS_LOCK_TTL_MS
        : CONFIRMATION_LINE_RETRY_LOCK_TTL_MS;
    const isValid =
      stored.version === 1 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt < lockTtl &&
      isRetryLockKind(stored.kind);

    if (!isValid) {
      storage.removeItem(key);
      return null;
    }

    if (stored.kind === "wait" && typeof stored.savedAt === "number") {
      return {
        kind: "wait",
        message: messages.wait,
        retryAt: stored.savedAt + CONFIRMATION_LINE_IN_PROGRESS_LOCK_TTL_MS,
        attemptId: normalizeConfirmationLineAttemptId(stored.attemptId),
      };
    }

    return stored.kind === "sent" || stored.kind === "history_check"
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
  return saveLineRetryLock(
    storage,
    STORAGE_KEY_PREFIX,
    reservationId,
    lock,
    now
  );
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
      return true;
    }

    const stored: StoredConfirmationLineRetryLock = {
      version: 1,
      savedAt: now,
      kind: lock.kind,
      ...(lock.kind === "wait" && lock.attemptId
        ? { attemptId: lock.attemptId }
        : {}),
    };
    storage.setItem(key, JSON.stringify(stored));
    return true;
  } catch {
    // The in-memory lock still protects the current screen when storage fails.
    return false;
  }
}

export function getConfirmationLineRetryLock(
  result: ConfirmationLineApiResult | null,
  now = Date.now()
): ConfirmationLineRetryLock | null {
  if (result?.status === "in_progress") {
    return getConfirmationLineInProgressLock(now);
  }

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

export function getConfirmationLineInProgressLock(
  now = Date.now(),
  attemptId = createConfirmationLineAttemptId()
): Extract<ConfirmationLineRetryLock, { kind: "wait" }> {
  return {
    kind: "wait",
    message: STORED_LOCK_MESSAGES.wait,
    retryAt: now + CONFIRMATION_LINE_IN_PROGRESS_LOCK_TTL_MS,
    attemptId: normalizeConfirmationLineAttemptId(attemptId),
  };
}

export async function claimConfirmationLineInProgressLock(
  storage: RetryLockStorage,
  reservationId: string,
  attemptId = createConfirmationLineAttemptId(),
  now = Date.now(),
  settle: () => Promise<void> = () =>
    new Promise((resolve) => {
      if (typeof globalThis.setTimeout === "function") {
        globalThis.setTimeout(resolve, 0);
        return;
      }
      resolve();
    })
) {
  const existing = readConfirmationLineRetryLock(storage, reservationId, now);
  if (existing) return { acquired: false, lock: existing };

  const lock = getConfirmationLineInProgressLock(now, attemptId);
  const persisted = saveConfirmationLineRetryLock(
    storage,
    reservationId,
    lock,
    now
  );
  if (!persisted) return { acquired: true, lock };

  await settle();
  const current = readConfirmationLineRetryLock(
    storage,
    reservationId,
    Date.now()
  );
  const acquired =
    current?.kind === "wait" &&
    Boolean(lock.attemptId) &&
    current.attemptId === lock.attemptId;

  return { acquired, lock: current ?? lock };
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
        isTerminalRetryLockKind(legacy.kind) &&
        Boolean(reservationRevision);

      if (
        !legacyIsValid ||
        !isTerminalRetryLockKind(legacy.kind) ||
        typeof legacy.savedAt !== "number"
      ) {
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
        attemptId: normalizeConfirmationLineAttemptId(stored.attemptId),
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
      return true;
    }

    const stored: StoredAlternativeLineRetryLock = {
      version: 2,
      savedAt: now,
      kind: lock.kind,
      reservationRevision,
      ...(lock.kind === "wait" && lock.attemptId
        ? { attemptId: lock.attemptId }
        : {}),
    };
    storage.setItem(key, JSON.stringify(stored));
    return true;
  } catch {
    // The in-memory lock still protects the current screen when storage fails.
    return false;
  }
}

export function getAlternativeLineInProgressLock(
  now = Date.now(),
  attemptId = createConfirmationLineAttemptId()
): Extract<AlternativeLineRetryLock, { kind: "wait" }> {
  return {
    kind: "wait",
    message: ALTERNATIVE_STORED_LOCK_MESSAGES.wait,
    retryAt: now + ALTERNATIVE_LINE_IN_PROGRESS_LOCK_TTL_MS,
    attemptId: normalizeConfirmationLineAttemptId(attemptId),
  };
}

export async function claimAlternativeLineInProgressLock(
  storage: RetryLockStorage,
  reservationId: string,
  reservationRevision: string,
  attemptId = createConfirmationLineAttemptId(),
  now = Date.now(),
  settle: () => Promise<void> = () =>
    new Promise((resolve) => {
      if (typeof globalThis.setTimeout === "function") {
        globalThis.setTimeout(resolve, 0);
        return;
      }
      resolve();
    })
) {
  const existing = readAlternativeLineRetryLock(
    storage,
    reservationId,
    reservationRevision,
    now
  );
  if (existing) return { acquired: false, lock: existing };

  const lock = getAlternativeLineInProgressLock(now, attemptId);
  const persisted = saveAlternativeLineRetryLock(
    storage,
    reservationId,
    reservationRevision,
    lock,
    now
  );
  if (!persisted) return { acquired: true, lock };

  await settle();
  const current = readAlternativeLineRetryLock(
    storage,
    reservationId,
    reservationRevision,
    Date.now()
  );
  const acquired =
    current?.kind === "wait" &&
    Boolean(lock.attemptId) &&
    current.attemptId === lock.attemptId;

  return { acquired, lock: current ?? lock };
}

export function getAlternativeLineRetryLock(
  result: AlternativeLineApiResult | null,
  now = Date.now()
): AlternativeLineRetryLock | null {
  if (result?.status === "in_progress") {
    const lock = getAlternativeLineInProgressLock(now);
    return {
      ...lock,
      message: result.error || result.message || lock.message,
      attemptId: undefined,
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
