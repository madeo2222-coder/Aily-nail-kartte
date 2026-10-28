export type CustomerReservationRequestAction =
  | "request_change"
  | "request_cancel";

export type CustomerReservationRequestLineResult = {
  ok?: boolean;
  message?: string;
};

export type CustomerReservationRequestLineLock = {
  action: CustomerReservationRequestAction;
  kind: "sent" | "history_check";
  message: string;
};

type RetryLockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredCustomerReservationRequestLineLock = {
  version: 1;
  savedAt: number;
  kind?: CustomerReservationRequestLineLock["kind"];
};

export const CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS =
  23 * 60 * 60 * 1000;

const STORAGE_KEY_PREFIX = "aily:customer-reservation-request-line:v1:";

function getStorageKey(
  reservationId: string,
  action: CustomerReservationRequestAction
) {
  return `${STORAGE_KEY_PREFIX}${reservationId}:${action}`;
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
  now = Date.now()
): CustomerReservationRequestLineLock | null {
  const key = getStorageKey(reservationId, action);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const stored = JSON.parse(
      raw
    ) as Partial<StoredCustomerReservationRequestLineLock>;
    const valid =
      stored.version === 1 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt <
        CUSTOMER_RESERVATION_REQUEST_LINE_LOCK_TTL_MS;

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
  now = Date.now()
) {
  if (!lock) return;

  const key = getStorageKey(reservationId, lock.action);

  try {
    const stored: StoredCustomerReservationRequestLineLock = {
      version: 1,
      savedAt: now,
      kind: lock.kind,
    };
    storage.setItem(key, JSON.stringify(stored));
  } catch {
    // The in-memory lock still protects the current screen when storage fails.
  }
}

export function getCustomerReservationRequestLineLock(
  result: CustomerReservationRequestLineResult | null,
  action: CustomerReservationRequestAction
): CustomerReservationRequestLineLock | null {
  if (!result) {
    return {
      action,
      kind: "history_check",
      message: getStoredMessage(action, "history_check"),
    };
  }

  if (!result.ok) return null;

  return {
    action,
    kind: "sent",
    message: result.message || getStoredMessage(action, "sent"),
  };
}
