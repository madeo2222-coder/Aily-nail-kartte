const CANCELLED_RESERVATION_STATUSES = new Set([
  "キャンセル",
  "cancelled",
  "canceled",
  "cancel",
  "取消",
  "取り消し",
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
