export type InboundReservationSubmission = {
  menu: string;
  date: string;
  time: string;
  salonId: string;
  durationMinutes: number;
  memo: string;
  guestCount: number;
  customerName: string;
  customerEmail: string;
};

type SubmissionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const inboundReservationSubmissionStorageKey =
  "aily:inbound-reservation-submission:v1";

function isSubmission(value: unknown): value is InboundReservationSubmission {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.menu === "string" &&
    typeof candidate.date === "string" &&
    typeof candidate.time === "string" &&
    typeof candidate.salonId === "string" &&
    typeof candidate.durationMinutes === "number" &&
    Number.isFinite(candidate.durationMinutes) &&
    typeof candidate.memo === "string" &&
    typeof candidate.guestCount === "number" &&
    Number.isFinite(candidate.guestCount) &&
    typeof candidate.customerName === "string" &&
    typeof candidate.customerEmail === "string"
  );
}

export function readPendingInboundReservationSubmission(
  storage: SubmissionStorage
): InboundReservationSubmission | null {
  try {
    const raw = storage.getItem(inboundReservationSubmissionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isSubmission(parsed)) {
      clearPendingInboundReservationSubmission(storage);
      return null;
    }
    return parsed;
  } catch {
    clearPendingInboundReservationSubmission(storage);
    return null;
  }
}

export function savePendingInboundReservationSubmission(
  storage: SubmissionStorage,
  submission: InboundReservationSubmission
) {
  if (!isSubmission(submission)) {
    throw new Error("Invalid inbound reservation submission.");
  }
  storage.setItem(
    inboundReservationSubmissionStorageKey,
    JSON.stringify(submission)
  );
}

export function clearPendingInboundReservationSubmission(
  storage: SubmissionStorage
) {
  try {
    storage.removeItem(inboundReservationSubmissionStorageKey);
  } catch {
    // A saved server result remains authoritative even if local cleanup fails.
  }
}
