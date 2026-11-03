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
  submissionOwnerId?: string;
  submissionStartedAt?: number;
};

export type CustomerReservationSubmissionClaim = {
  operationId: string;
  ownerId: string;
  expiresAt: number;
};

const STORAGE_KEY = "aily:customer-reservation-submission:v1";
const NOTIFICATION_RETRY_TTL_MS = 24 * 60 * 60 * 1000;
const SUBMISSION_CLAIM_TTL_MS = 5 * 60 * 1000;
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
    const submissionOwnerId = candidate.submissionOwnerId;
    const submissionStartedAt = candidate.submissionStartedAt;

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
      submissionOwnerId:
        typeof submissionOwnerId === "string" &&
        isCustomerReservationOperationId(submissionOwnerId)
          ? submissionOwnerId
          : undefined,
      submissionStartedAt:
        typeof submissionStartedAt === "number" &&
        Number.isFinite(submissionStartedAt)
          ? submissionStartedAt
          : undefined,
    };
  } catch {
    return null;
  }
}

function withoutSubmissionClaim(
  stored: StoredSubmission,
): StoredSubmission {
  return {
    fingerprint: stored.fingerprint,
    operationId: stored.operationId,
    ...(stored.notificationRetryableAt === undefined
      ? {}
      : { notificationRetryableAt: stored.notificationRetryableAt }),
    ...(stored.notificationRetryCustomerId === undefined
      ? {}
      : {
          notificationRetryCustomerId:
            stored.notificationRetryCustomerId,
        }),
  };
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
    const retryableSubmission = withoutSubmissionClaim(stored);
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...retryableSubmission,
        notificationRetryableAt: now,
        notificationRetryCustomerId: customerId,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function getActiveSubmissionClaim(
  stored: StoredSubmission | null,
  now: number,
): CustomerReservationSubmissionClaim | null {
  if (
    !stored?.submissionOwnerId ||
    stored.submissionStartedAt === undefined ||
    !Number.isFinite(now)
  ) {
    return null;
  }

  const age = now - stored.submissionStartedAt;
  if (age < 0 || age >= SUBMISSION_CLAIM_TTL_MS) return null;

  return {
    operationId: stored.operationId,
    ownerId: stored.submissionOwnerId,
    expiresAt: stored.submissionStartedAt + SUBMISSION_CLAIM_TTL_MS,
  };
}

export async function claimCustomerReservationSubmission(
  storage: StorageLike,
  operationId: string,
  ownerId: string,
  now = Date.now(),
  settle: () => Promise<void> = () =>
    new Promise((resolve) => {
      if (typeof globalThis.setTimeout === "function") {
        globalThis.setTimeout(resolve, 0);
        return;
      }
      resolve();
    }),
): Promise<{
  acquired: boolean;
  claim: CustomerReservationSubmissionClaim | null;
}> {
  if (
    !isCustomerReservationOperationId(operationId) ||
    !isCustomerReservationOperationId(ownerId) ||
    !Number.isFinite(now)
  ) {
    return { acquired: false, claim: null };
  }

  const stored = readStoredSubmission(storage);
  if (!stored) {
    // Keep booking available when browser storage is unavailable. The request
    // still carries its idempotent operation ID and the current screen guard.
    return {
      acquired: true,
      claim: {
        operationId,
        ownerId,
        expiresAt: now + SUBMISSION_CLAIM_TTL_MS,
      },
    };
  }
  if (
    stored.operationId !== operationId ||
    stored.notificationRetryableAt !== undefined
  ) {
    return { acquired: false, claim: null };
  }

  const activeClaim = getActiveSubmissionClaim(stored, now);
  if (activeClaim) {
    return {
      acquired: activeClaim.ownerId === ownerId,
      claim: activeClaim,
    };
  }

  const claim = {
    operationId,
    ownerId,
    expiresAt: now + SUBMISSION_CLAIM_TTL_MS,
  };

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...stored,
        submissionOwnerId: ownerId,
        submissionStartedAt: now,
      }),
    );
  } catch {
    return { acquired: true, claim };
  }

  await settle();
  const current = readStoredSubmission(storage);
  const currentClaim = getActiveSubmissionClaim(
    current,
    Math.max(now, Date.now()),
  );
  return {
    acquired:
      current?.operationId === operationId &&
      currentClaim?.ownerId === ownerId,
    claim: currentClaim ?? claim,
  };
}

export function releaseCustomerReservationSubmissionClaim(
  storage: StorageLike,
  operationId: string,
  ownerId: string,
) {
  const stored = readStoredSubmission(storage);
  if (
    stored?.operationId !== operationId ||
    stored.submissionOwnerId !== ownerId
  ) {
    return false;
  }

  const pendingSubmission = withoutSubmissionClaim(stored);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(pendingSubmission));
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

export function getPendingCustomerReservationSubmission(
  storage: StorageLike,
): {
  submission: CustomerReservationSubmission;
  operationId: string;
} | null {
  const stored = readStoredSubmission(storage);
  if (!stored || stored.notificationRetryableAt !== undefined) return null;

  const submission = parseCustomerReservationFingerprint(stored.fingerprint);
  if (!submission) return null;

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
