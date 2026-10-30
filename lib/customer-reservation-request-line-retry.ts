export type CustomerReservationRequestAction =
  | "request_change"
  | "request_cancel";

export type CustomerReservationRequestLineResult = {
  ok?: boolean;
  message?: string;
  retryable?: boolean;
  deliveryStatus?: string;
};

export type CustomerReservationRequestLineLock = {
  action: CustomerReservationRequestAction;
  kind: "sent" | "history_check";
  message: string;
};

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
};

type LegacyStoredCustomerReservationRequestLineLock = {
  version: 1;
  savedAt: number;
  kind?: CustomerReservationRequestLineLock["kind"];
};

type StoredCustomerReservationRequestRetry = {
  version: 2;
  savedAt: number;
  requestMessage: string;
  expectedRequestRevision: string;
};

export const CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS =
  23 * 60 * 60 * 1000;

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
  if (kind === "history_check") {
    return "店舗へのLINE送信結果を確認できません。同じ依頼を繰り返さず、店舗へ送信状況を確認してください。";
  }

  return action === "request_cancel"
    ? "キャンセル希望は店舗へ送信済みです。重複送信していません。"
    : "変更希望は店舗へ送信済みです。重複送信していません。";
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
    const valid =
      stored.version === 2 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt <
        CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS &&
      (stored.kind === "sent" || stored.kind === "history_check") &&
      typeof stored.reservationRevision === "string" &&
      Boolean(stored.reservationRevision) &&
      stored.reservationRevision === reservationRevision;

    if (!valid) {
      storage.removeItem(key);
      return null;
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

export function saveCustomerReservationRequestLineLock(
  storage: RetryLockStorage,
  reservationId: string,
  lock: CustomerReservationRequestLineLock | null,
  reservationRevision: string,
  now = Date.now()
) {
  if (!lock || !reservationRevision) return;

  const key = getStorageKey(STORAGE_KEY_PREFIX, reservationId, lock.action);

  try {
    const stored: StoredCustomerReservationRequestLineLock = {
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
