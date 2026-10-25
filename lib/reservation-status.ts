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

const RESERVATION_STATUS_LABELS = new Map([
  ["requested", "予約申請中"],
  ["予約申請中", "予約申請中"],
  ["予約受付", "予約受付"],
  ["予約", "予約受付"],
  ["confirmed", "予約確定"],
  ["予約確定", "予約確定"],
  ["来店予定", "来店予定"],
  ["来店", "来店"],
  ["完了待ち", "完了待ち"],
  ["completed", "完了"],
  ["完了", "完了"],
]);

export function getReservationStatusLabel(
  status: string | null | undefined,
  fallback = "予約受付"
) {
  const raw = String(status ?? "");
  const normalized = normalizeReservationStatus(raw);

  if (!normalized) return fallback;
  if (CANCELLED_RESERVATION_STATUSES.has(normalized)) return "キャンセル";

  return (
    RESERVATION_STATUS_LABELS.get(normalized) ||
    raw.normalize("NFKC").trim()
  );
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
