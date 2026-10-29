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
};

const STORAGE_KEY = "aily:customer-reservation-submission:v1";
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

    return {
      fingerprint: candidate.fingerprint,
      operationId: candidate.operationId,
    };
  } catch {
    return null;
  }
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
