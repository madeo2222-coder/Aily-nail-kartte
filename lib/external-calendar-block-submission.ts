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
};

const STORAGE_KEY = "aily:external-calendar-block-submission:v1";
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

    return {
      fingerprint: candidate.fingerprint,
      operationId: candidate.operationId,
    };
  } catch {
    return null;
  }
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
