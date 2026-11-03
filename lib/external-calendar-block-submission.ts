export type ExternalCalendarBlockSubmission = {
  source: string;
  salonId: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  memo: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredSubmission = {
  fingerprint: string;
  operationId: string;
  submissionOwnerId?: string;
  submissionStartedAt?: number;
};

export type ExternalCalendarBlockSubmissionClaim = {
  operationId: string;
  ownerId: string;
  expiresAt: number;
};

const STORAGE_KEY = "aily:external-calendar-block-submission:v1";
const OWNER_STORAGE_KEY =
  "aily:external-calendar-block-submission-owner:v1";
export const EXTERNAL_BLOCK_SUBMISSION_CLAIM_TTL_MS = 5 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isExternalBlockOperationId(value: string) {
  return UUID_PATTERN.test(value);
}

export function buildExternalBlockFingerprint(
  submission: ExternalCalendarBlockSubmission,
) {
  return JSON.stringify([
    submission.source,
    submission.salonId,
    submission.staffId,
    submission.date,
    submission.startTime,
    submission.endTime,
    submission.title,
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
      !isExternalBlockOperationId(candidate.operationId)
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
        isExternalBlockOperationId(submissionOwnerId)
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
): ExternalCalendarBlockSubmissionClaim | null {
  if (
    !stored?.submissionOwnerId ||
    stored.submissionStartedAt === undefined ||
    !Number.isFinite(now)
  ) {
    return null;
  }

  const age = now - stored.submissionStartedAt;
  if (age < 0 || age >= EXTERNAL_BLOCK_SUBMISSION_CLAIM_TTL_MS) {
    return null;
  }

  return {
    operationId: stored.operationId,
    ownerId: stored.submissionOwnerId,
    expiresAt:
      stored.submissionStartedAt + EXTERNAL_BLOCK_SUBMISSION_CLAIM_TTL_MS,
  };
}

export async function claimExternalBlockSubmission(
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
  claim: ExternalCalendarBlockSubmissionClaim | null;
}> {
  if (
    !isExternalBlockOperationId(operationId) ||
    !isExternalBlockOperationId(ownerId) ||
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
        expiresAt: now + EXTERNAL_BLOCK_SUBMISSION_CLAIM_TTL_MS,
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
    expiresAt: now + EXTERNAL_BLOCK_SUBMISSION_CLAIM_TTL_MS,
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

export function getPendingExternalBlockOperationId(storage: StorageLike) {
  return readStoredSubmission(storage)?.operationId || null;
}

export function getOrCreateExternalBlockSubmissionOwnerId(
  storage: Pick<Storage, "getItem" | "setItem">,
  createOwnerId: () => string,
) {
  try {
    const storedOwnerId = storage.getItem(OWNER_STORAGE_KEY);
    if (storedOwnerId && isExternalBlockOperationId(storedOwnerId)) {
      return storedOwnerId;
    }
  } catch {
    // A stable in-memory owner can still guard the current screen.
  }

  const ownerId = createOwnerId();
  if (!isExternalBlockOperationId(ownerId)) {
    throw new Error("外部予定の登録画面IDを作成できませんでした");
  }

  try {
    storage.setItem(OWNER_STORAGE_KEY, ownerId);
  } catch {
    // sessionStorage can be unavailable in browser privacy modes.
  }
  return ownerId;
}

export function getOrCreateExternalBlockOperationId(
  storage: StorageLike,
  fingerprint: string,
  createOperationId: () => string,
) {
  const stored = readStoredSubmission(storage);
  if (stored?.fingerprint === fingerprint) return stored.operationId;

  const operationId = createOperationId();
  if (!isExternalBlockOperationId(operationId)) {
    throw new Error("外部予定の登録操作IDを作成できませんでした");
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ fingerprint, operationId }));
  } catch {
    // The request can still use the operation ID when browser storage is unavailable.
  }
  return operationId;
}

export function clearExternalBlockOperation(
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
