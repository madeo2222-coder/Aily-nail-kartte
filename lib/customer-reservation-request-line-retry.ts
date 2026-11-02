export type CustomerReservationRequestAction =
  | "request_change"
  | "request_cancel";

export type CustomerReservationRequestLineResult = {
  ok?: boolean;
  message?: string;
  retryable?: boolean;
  deliveryStatus?: string;
};

type CustomerReservationRequestTerminalLineLock = {
  action: CustomerReservationRequestAction;
  kind: "sent" | "history_check";
  message: string;
};

type CustomerReservationRequestWaitLineLock = {
  action: CustomerReservationRequestAction;
  kind: "wait";
  message: string;
  retryAt: number;
  attemptId?: string;
};

export type CustomerReservationRequestLineLock =
  | CustomerReservationRequestTerminalLineLock
  | CustomerReservationRequestWaitLineLock;

export type CustomerReservationRequestRetry = {
  action: CustomerReservationRequestAction;
  requestMessage: string;
  expectedRequestRevision: string;
};

type RetryLockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredCustomerReservationRequestLineLock = {
  version: 2;
  savedAt: number;
  kind: CustomerReservationRequestLineLock["kind"];
  reservationRevision: string;
  attemptId?: string;
};

type LegacyStoredCustomerReservationRequestLineLock = {
  version: 1;
  savedAt: number;
  kind?: CustomerReservationRequestTerminalLineLock["kind"];
};

type StoredCustomerReservationRequestRetry = {
  version: 2;
  savedAt: number;
  requestMessage: string;
  expectedRequestRevision: string;
};

export const CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS =
  23 * 60 * 60 * 1000;
export const CUSTOMER_RESERVATION_REQUEST_LINE_IN_PROGRESS_LOCK_TTL_MS =
  5 * 60 * 1000;

const CUSTOMER_RESERVATION_REQUEST_ATTEMPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STORAGE_KEY_PREFIX = "aily:customer-reservation-request-line:v2:";
const LEGACY_STORAGE_KEY_PREFIX =
  "aily:customer-reservation-request-line:v1:";
const RETRY_STORAGE_KEY_PREFIX =
  "aily:customer-reservation-request-line-retry:v2:";

function getStorageKey(
  prefix: string,
  reservationId: string,
  action: CustomerReservationRequestAction
) {
  return `${prefix}${reservationId}:${action}`;
}

function getStoredMessage(
  action: CustomerReservationRequestAction,
  kind: CustomerReservationRequestLineLock["kind"]
) {
  if (kind === "wait") {
    return action === "request_cancel"
      ? "キャンセル希望の送信処理が進行中です。5分後にこの画面から同じ内容を再試行できます。"
      : "変更希望の送信処理が進行中です。5分後にこの画面から同じ内容を再試行できます。";
  }

  if (kind === "history_check") {
    return "店舗へのLINE送信結果を確認できません。同じ依頼を繰り返さず、店舗へ送信状況を確認してください。";
  }

  return action === "request_cancel"
    ? "キャンセル希望は店舗へ送信済みです。重複送信していません。"
    : "変更希望は店舗へ送信済みです。重複送信していません。";
}

function normalizeAttemptId(value: unknown) {
  return typeof value === "string" &&
    CUSTOMER_RESERVATION_REQUEST_ATTEMPT_ID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : undefined;
}

export function createCustomerReservationRequestAttemptId(
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

export function readCustomerReservationRequestLineLock(
  storage: RetryLockStorage,
  reservationId: string,
  action: CustomerReservationRequestAction,
  reservationRevision: string,
  now = Date.now()
): CustomerReservationRequestLineLock | null {
  const key = getStorageKey(STORAGE_KEY_PREFIX, reservationId, action);
  const legacyKey = getStorageKey(
    LEGACY_STORAGE_KEY_PREFIX,
    reservationId,
    action
  );

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      const legacyRaw = storage.getItem(legacyKey);
      if (!legacyRaw) return null;

      const legacy = JSON.parse(
        legacyRaw
      ) as Partial<LegacyStoredCustomerReservationRequestLineLock>;
      const legacyValid =
        legacy.version === 1 &&
        typeof legacy.savedAt === "number" &&
        Number.isFinite(legacy.savedAt) &&
        legacy.savedAt <= now &&
        now - legacy.savedAt <
          CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS &&
        Boolean(reservationRevision);

      if (!legacyValid || legacy.savedAt === undefined) {
        storage.removeItem(legacyKey);
        return null;
      }

      const kind =
        legacy.kind === "history_check" ? "history_check" : "sent";
      const migrated: StoredCustomerReservationRequestLineLock = {
        version: 2,
        savedAt: legacy.savedAt,
        kind,
        reservationRevision,
      };
      storage.setItem(key, JSON.stringify(migrated));
      storage.removeItem(legacyKey);

      return {
        action,
        kind,
        message: getStoredMessage(action, kind),
      };
    }

    const stored = JSON.parse(
      raw
    ) as Partial<StoredCustomerReservationRequestLineLock>;
    const validKind =
      stored.kind === "sent" ||
      stored.kind === "history_check" ||
      stored.kind === "wait";
    const lockTtl =
      stored.kind === "wait"
        ? CUSTOMER_RESERVATION_REQUEST_LINE_IN_PROGRESS_LOCK_TTL_MS
        : CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS;
    const valid =
      stored.version === 2 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt < lockTtl &&
      validKind &&
      typeof stored.reservationRevision === "string" &&
      Boolean(stored.reservationRevision) &&
      stored.reservationRevision === reservationRevision;

    if (!valid) {
      storage.removeItem(key);
      return null;
    }

    if (stored.kind === "wait") {
      return {
        action,
        kind: "wait",
        message: getStoredMessage(action, "wait"),
        retryAt:
          (stored.savedAt as number) +
          CUSTOMER_RESERVATION_REQUEST_LINE_IN_PROGRESS_LOCK_TTL_MS,
        attemptId: normalizeAttemptId(stored.attemptId),
      };
    }

    const kind = stored.kind === "history_check" ? "history_check" : "sent";

    return {
      action,
      kind,
      message: getStoredMessage(action, kind),
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

export function clearCustomerReservationRequestLineLock(
  storage: RetryLockStorage,
  reservationId: string,
  action: CustomerReservationRequestAction
) {
  const key = getStorageKey(STORAGE_KEY_PREFIX, reservationId, action);

  try {
    storage.removeItem(key);
  } catch {
    // The in-memory lock is cleared by the caller when storage is unavailable.
  }
}

export function getCustomerReservationRequestInProgressLock(
  action: CustomerReservationRequestAction,
  now = Date.now(),
  attemptId = createCustomerReservationRequestAttemptId()
): CustomerReservationRequestWaitLineLock {
  return {
    action,
    kind: "wait",
    message: getStoredMessage(action, "wait"),
    retryAt:
      now + CUSTOMER_RESERVATION_REQUEST_LINE_IN_PROGRESS_LOCK_TTL_MS,
    attemptId: normalizeAttemptId(attemptId),
  };
}

export function saveCustomerReservationRequestLineLock(
  storage: RetryLockStorage,
  reservationId: string,
  lock: CustomerReservationRequestLineLock | null,
  reservationRevision: string,
  now = Date.now()
) {
  if (!lock || !reservationRevision) return false;

  const key = getStorageKey(STORAGE_KEY_PREFIX, reservationId, lock.action);

  try {
    const stored: StoredCustomerReservationRequestLineLock = {
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

export async function claimCustomerReservationRequestLineLock(
  storage: RetryLockStorage,
  reservationId: string,
  action: CustomerReservationRequestAction,
  reservationRevision: string,
  attemptId = createCustomerReservationRequestAttemptId(),
  now = Date.now(),
  settle: () => Promise<void> = () =>
    new Promise((resolve) => globalThis.setTimeout(resolve, 0))
) {
  const existing = readCustomerReservationRequestLineLock(
    storage,
    reservationId,
    action,
    reservationRevision,
    now
  );
  if (existing) return { acquired: false, lock: existing };

  const lock = getCustomerReservationRequestInProgressLock(
    action,
    now,
    attemptId
  );
  const persisted = saveCustomerReservationRequestLineLock(
    storage,
    reservationId,
    lock,
    reservationRevision,
    now
  );

  if (!persisted) {
    return { acquired: true, lock };
  }

  await settle();
  const current = readCustomerReservationRequestLineLock(
    storage,
    reservationId,
    action,
    reservationRevision,
    Date.now()
  );
  const acquired =
    current?.kind === "wait" &&
    Boolean(lock.attemptId) &&
    current.attemptId === lock.attemptId;

  return { acquired, lock: current ?? lock };
}

export function readCustomerReservationRequestRetry(
  storage: RetryLockStorage,
  reservationId: string,
  action: CustomerReservationRequestAction,
  reservationRevision: string,
  now = Date.now()
): CustomerReservationRequestRetry | null {
  const key = `${RETRY_STORAGE_KEY_PREFIX}${reservationId}:${action}`;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredCustomerReservationRequestRetry>;
    const valid =
      stored.version === 2 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt < CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS &&
      typeof stored.requestMessage === "string" &&
      typeof stored.expectedRequestRevision === "string" &&
      Boolean(stored.expectedRequestRevision) &&
      Boolean(reservationRevision) &&
      stored.expectedRequestRevision === reservationRevision;

    if (!valid) {
      storage.removeItem(key);
      return null;
    }

    return {
      action,
      requestMessage: stored.requestMessage || "",
      expectedRequestRevision: stored.expectedRequestRevision || "",
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

export function saveCustomerReservationRequestRetry(
  storage: RetryLockStorage,
  reservationId: string,
  retry: CustomerReservationRequestRetry | null,
  action: CustomerReservationRequestAction,
  now = Date.now()
) {
  const key = `${RETRY_STORAGE_KEY_PREFIX}${reservationId}:${action}`;

  try {
    if (!retry) {
      storage.removeItem(key);
      return;
    }

    const stored: StoredCustomerReservationRequestRetry = {
      version: 2,
      savedAt: now,
      requestMessage: retry.requestMessage,
      expectedRequestRevision: retry.expectedRequestRevision,
    };
    storage.setItem(key, JSON.stringify(stored));
  } catch {
    // The in-memory retry still protects the current screen when storage fails.
  }
}

export function shouldKeepCustomerReservationRequestRetry(
  result: CustomerReservationRequestLineResult | null
) {
  if (!result) return true;
  return (
    result.ok !== true &&
    result.retryable === true &&
    (result.deliveryStatus === "failed" || result.deliveryStatus === "unknown")
  );
}

export function getCustomerReservationRequestLineLock(
  result: CustomerReservationRequestLineResult | null,
  action: CustomerReservationRequestAction
): CustomerReservationRequestLineLock | null {
  if (!result) {
    return null;
  }

  if (!result.ok) return null;

  return {
    action,
    kind: "sent",
    message: result.message || getStoredMessage(action, "sent"),
  };
}
