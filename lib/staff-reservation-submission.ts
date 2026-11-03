export type StaffReservationSubmission = {
  mode: string;
  salonId: string;
  customerId: string | null;
  staffId: string;
  menu: string;
  startAt: string;
  endAt: string;
  status: string;
  memo: string | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredSubmission = {
  fingerprint: string;
  operationId: string;
  submissionOwnerId?: string;
  submissionStartedAt?: number;
};

export type StaffReservationSubmissionClaim = {
  operationId: string;
  ownerId: string;
  expiresAt: number;
};

const STORAGE_KEY = "aily:staff-reservation-submission:v1";
const OWNER_STORAGE_KEY = "aily:staff-reservation-submission-owner:v1";
export const STAFF_RESERVATION_SUBMISSION_CLAIM_TTL_MS = 5 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSubmissionOperationId(value: string) {
  return UUID_PATTERN.test(value);
}

export function buildStaffReservationFingerprint(
  submission: StaffReservationSubmission,
) {
  return JSON.stringify([
    submission.mode,
    submission.salonId,
    submission.customerId,
    submission.staffId,
    submission.menu,
    submission.startAt,
    submission.endAt,
    submission.status,
    submission.memo,
  ]);
}

function readStoredSubmission(storage: StorageLike): StoredSubmission | null {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || "null") as unknown;
    if (!value || typeof value !== "object") return null;

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.fingerprint !== "string" ||
      typeof candidate.operationId !== "string" ||
      !isSubmissionOperationId(candidate.operationId)
    ) {
      return null;
    }

    const submissionOwnerId = candidate.submissionOwnerId;
    const submissionStartedAt = candidate.submissionStartedAt;

    return {
      fingerprint: candidate.fingerprint,
      operationId: candidate.operationId,
      submissionOwnerId:
        typeof submissionOwnerId === "string" &&
        isSubmissionOperationId(submissionOwnerId)
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

function getActiveSubmissionClaim(
  stored: StoredSubmission | null,
  now: number,
): StaffReservationSubmissionClaim | null {
  if (
    !stored?.submissionOwnerId ||
    stored.submissionStartedAt === undefined ||
    !Number.isFinite(now)
  ) {
    return null;
  }

  const age = now - stored.submissionStartedAt;
  if (age < 0 || age >= STAFF_RESERVATION_SUBMISSION_CLAIM_TTL_MS) {
    return null;
  }

  return {
    operationId: stored.operationId,
    ownerId: stored.submissionOwnerId,
    expiresAt:
      stored.submissionStartedAt + STAFF_RESERVATION_SUBMISSION_CLAIM_TTL_MS,
  };
}

export async function claimStaffReservationSubmission(
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
  claim: StaffReservationSubmissionClaim | null;
}> {
  if (
    !isSubmissionOperationId(operationId) ||
    !isSubmissionOperationId(ownerId) ||
    !Number.isFinite(now)
  ) {
    return { acquired: false, claim: null };
  }

  const stored = readStoredSubmission(storage);
  if (!stored) {
    // The API operation ID and current-screen guard remain available when
    // browser storage cannot persist a shared claim.
    return {
      acquired: true,
      claim: {
        operationId,
        ownerId,
        expiresAt: now + STAFF_RESERVATION_SUBMISSION_CLAIM_TTL_MS,
      },
    };
  }
  if (stored.operationId !== operationId) {
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
    expiresAt: now + STAFF_RESERVATION_SUBMISSION_CLAIM_TTL_MS,
  };

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fingerprint: stored.fingerprint,
        operationId: stored.operationId,
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

export function getPendingStaffReservationOperation(storage: StorageLike) {
  return readStoredSubmission(storage);
}

export function getOrCreateStaffReservationOperationId(
  storage: StorageLike,
  fingerprint: string,
  createOperationId: () => string,
) {
  const stored = readStoredSubmission(storage);
  if (stored?.fingerprint === fingerprint) return stored.operationId;

  const operationId = createOperationId();
  if (!isSubmissionOperationId(operationId)) {
    throw new Error("予約登録操作IDを作成できませんでした");
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ fingerprint, operationId }));
  } catch {
    // The API can still use the operation ID for this request when storage is unavailable.
  }
  return operationId;
}

export function getOrCreateStaffReservationSubmissionOwnerId(
  storage: Pick<Storage, "getItem" | "setItem">,
  createOwnerId: () => string,
) {
  try {
    const storedOwnerId = storage.getItem(OWNER_STORAGE_KEY);
    if (storedOwnerId && isSubmissionOperationId(storedOwnerId)) {
      return storedOwnerId;
    }
  } catch {
    // A same-page owner remains available even when session storage is blocked.
  }

  const ownerId = createOwnerId();
  if (!isSubmissionOperationId(ownerId)) {
    throw new Error("予約登録画面IDを作成できませんでした");
  }

  try {
    storage.setItem(OWNER_STORAGE_KEY, ownerId);
  } catch {
    // The current page can still use the generated owner ID.
  }
  return ownerId;
}

export function clearStaffReservationOperation(
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
