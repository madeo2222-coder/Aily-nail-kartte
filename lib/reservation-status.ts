const CANCELLED_RESERVATION_STATUSES = new Set([
  "キャンセル",
  "cancelled",
  "canceled",
  "cancel",
  "取消",
  "取り消し",
]);

// These states are advanced by staff after a booking has been accepted.
// Replaying an older external booking mail must never move them backwards.
const PROGRESSED_RESERVATION_STATUSES = new Set([
  "来店",
  "来店予定",
  "完了待ち",
  "完了",
  "completed",
]);

function normalizeReservationStatus(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function isCancelledReservationStatus(
  status: string | null | undefined
) {
  return CANCELLED_RESERVATION_STATUSES.has(
    normalizeReservationStatus(status)
  );
}

export function isProgressedReservationStatus(
  status: string | null | undefined
) {
  return PROGRESSED_RESERVATION_STATUSES.has(
    normalizeReservationStatus(status)
  );
}
