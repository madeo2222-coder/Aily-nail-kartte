import { createHash } from "node:crypto";

export type MailSyncSource = "hpb" | "minimo";

export type ManualReservationCandidate = {
  id: string;
  staff_id: string | null;
  menu: string | null;
  memo: string | null;
  status: string | null;
};

const CANCELLED_STATUSES = new Set([
  "cancelled",
  "canceled",
  "cancel",
  "キャンセル",
  "取消",
  "取り消し",
]);

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function hasSourceMarker(source: MailSyncSource, value: string) {
  if (source === "minimo") {
    return value.includes("minimo") || value.includes("ミニモ");
  }

  return (
    value.includes("hpb") ||
    value.includes("hotpepper") ||
    value.includes("ホットペッパー")
  );
}

function hasExternalReservationKey(value: string) {
  return value.includes("hpb予約番号") || value.includes("ミニモ予約id");
}

function buildDeterministicId(
  kind: "reservation" | "customer",
  source: MailSyncSource,
  reservationNumber: string
) {
  const bytes = createHash("sha256")
    .update(`aily:external-${kind}:${source}:${reservationNumber.trim()}`)
    .digest()
    .subarray(0, 16);

  // UUID version 8 is reserved for application-defined deterministic IDs.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildExternalReservationId(
  source: MailSyncSource,
  reservationNumber: string
) {
  return buildDeterministicId("reservation", source, reservationNumber);
}

export function buildExternalCustomerId(
  source: MailSyncSource,
  reservationNumber: string
) {
  return buildDeterministicId("customer", source, reservationNumber);
}

export function findManualReservationCandidate({
  candidates,
  source,
  staffId,
}: {
  candidates: ManualReservationCandidate[];
  source: MailSyncSource;
  staffId: string | null;
}) {
  const matches = candidates.filter((candidate) => {
    if (CANCELLED_STATUSES.has(normalize(candidate.status))) return false;
    if (staffId && candidate.staff_id !== staffId) return false;

    const text = normalize(`${candidate.menu || ""}\n${candidate.memo || ""}`);
    return hasSourceMarker(source, text) && !hasExternalReservationKey(text);
  });

  if (matches.length > 1) {
    throw new Error(
      "同時刻に未照合の外部予約が複数あります。重複作成を避けるため同期を停止しました。"
    );
  }

  return matches[0] || null;
}
