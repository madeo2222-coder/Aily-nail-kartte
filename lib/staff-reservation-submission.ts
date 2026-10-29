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
};

const STORAGE_KEY = "aily:staff-reservation-submission:v1";
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

    return {
      fingerprint: candidate.fingerprint,
      operationId: candidate.operationId,
    };
  } catch {
    return null;
  }
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
