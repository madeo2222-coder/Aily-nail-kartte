export type CustomerReservationSubmission = {
  menu: string;
  date: string;
  time: string;
  staffId: string;
  durationMinutes: number;
  memo: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredSubmission = {
  fingerprint: string;
  operationId: string;
  notificationRetryableAt?: number;
  notificationRetryCustomerId?: string;
};

const STORAGE_KEY = "aily:customer-reservation-submission:v1";
const NOTIFICATION_RETRY_TTL_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCustomerReservationOperationId(value: string) {
  return UUID_PATTERN.test(value);
}

export function buildCustomerReservationFingerprint(
  submission: CustomerReservationSubmission,
) {
  return JSON.stringify([
    submission.menu,
    submission.date,
    submission.time,
    submission.staffId,
    submission.durationMinutes,
    submission.memo,
  ]);
}

function parseCustomerReservationFingerprint(
  fingerprint: string,
): CustomerReservationSubmission | null {
  try {
    const value = JSON.parse(fingerprint) as unknown;
    if (!Array.isArray(value) || value.length !== 6) return null;

    const [menu, date, time, staffId, durationMinutes, memo] = value;
    if (
      typeof menu !== "string" ||
      typeof date !== "string" ||
      typeof time !== "string" ||
      typeof staffId !== "string" ||
      typeof durationMinutes !== "number" ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes <= 0 ||
      typeof memo !== "string"
    ) {
      return null;
    }

    return { menu, date, time, staffId, durationMinutes, memo };
  } catch {
    return null;
  }
}

function readStoredSubmission(storage: StorageLike): StoredSubmission | null {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || "null") as unknown;
    if (!value || typeof value !== "object") return null;

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.fingerprint !== "string" ||
      typeof candidate.operationId !== "string" ||
      !isCustomerReservationOperationId(candidate.operationId)
    ) {
      return null;
    }

    const notificationRetryableAt = candidate.notificationRetryableAt;
    const notificationRetryCustomerId = candidate.notificationRetryCustomerId;

    return {
      fingerprint: candidate.fingerprint,
      operationId: candidate.operationId,
      notificationRetryableAt:
        typeof notificationRetryableAt === "number" &&
        Number.isFinite(notificationRetryableAt)
          ? notificationRetryableAt
          : undefined,
      notificationRetryCustomerId:
        typeof notificationRetryCustomerId === "string"
          ? notificationRetryCustomerId
          : undefined,
    };
  } catch {
    return null;
  }
}

export function markCustomerReservationNotificationRetryable(
  storage: StorageLike,
  operationId: string,
  customerId: string,
  now = Date.now(),
) {
  const stored = readStoredSubmission(storage);
  if (
    stored?.operationId !== operationId ||
    !customerId.trim() ||
    !Number.isFinite(now)
  ) {
    return false;
  }

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...stored,
        notificationRetryableAt: now,
        notificationRetryCustomerId: customerId,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function getCustomerReservationNotificationRetry(
  storage: StorageLike,
  customerId: string,
  now = Date.now(),
): {
  submission: CustomerReservationSubmission;
  operationId: string;
} | null {
  const stored = readStoredSubmission(storage);
  if (stored?.notificationRetryableAt === undefined) return null;
  if (
    !customerId.trim() ||
    stored.notificationRetryCustomerId !== customerId
  ) {
    return null;
  }

  const age = now - stored.notificationRetryableAt;
  const submission = parseCustomerReservationFingerprint(stored.fingerprint);
  if (
    !Number.isFinite(now) ||
    age < 0 ||
    age > NOTIFICATION_RETRY_TTL_MS ||
    !submission
  ) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // An invalid or expired marker will be ignored even if cleanup fails.
    }
    return null;
  }

  return { submission, operationId: stored.operationId };
}

export function getOrCreateCustomerReservationOperationId(
  storage: StorageLike,
  fingerprint: string,
  createOperationId: () => string,
) {
  const stored = readStoredSubmission(storage);
  if (stored?.fingerprint === fingerprint) return stored.operationId;

  const operationId = createOperationId();
  if (!isCustomerReservationOperationId(operationId)) {
    throw new Error("予約申請操作IDを作成できませんでした");
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ fingerprint, operationId }));
  } catch {
    // The request can still use the in-memory operation ID.
  }

  return operationId;
}

export function clearCustomerReservationOperation(
  storage: StorageLike,
  operationId: string,
) {
  const stored = readStoredSubmission(storage);
  if (stored?.operationId !== operationId) return;

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // A failed cleanup only leaves a reusable operation ID for the same payload.
  }
}
