import { createHash } from "node:crypto";
import { isCancelledReservationStatus } from "@/lib/reservation-status";

export { isCancelledReservationStatus } from "@/lib/reservation-status";

export type MailSyncSource = "hpb" | "minimo";

export const MANUAL_RESERVATION_TIME_TOLERANCE_MINUTES = 5;

export type ManualReservationCandidate = {
  id: string;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  memo: string | null;
  status: string | null;
};

type ExternalReservationCandidate = {
  memo: string | null;
};

export function buildManualReservationLookupWindow(startAt: string) {
  const parsedStartAt = new Date(startAt);

  if (!Number.isFinite(parsedStartAt.getTime())) {
    throw new Error("外部予約の開始日時を照合できませんでした。");
  }

  const toleranceMilliseconds =
    MANUAL_RESERVATION_TIME_TOLERANCE_MINUTES * 60 * 1000;

  return {
    from: new Date(
      parsedStartAt.getTime() - toleranceMilliseconds
    ).toISOString(),
    to: new Date(
      parsedStartAt.getTime() + toleranceMilliseconds
    ).toISOString(),
  };
}

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

export function appendExternalCancellationMemo({
  existingMemo,
  sourceLabel,
  rawText,
}: {
  existingMemo: string | null | undefined;
  sourceLabel: string;
  rawText: string;
}) {
  const cancellationBlock = `【${sourceLabel}キャンセルメール本文】\n${rawText}`;

  if (existingMemo?.includes(cancellationBlock)) {
    return existingMemo;
  }

  return [existingMemo?.trimEnd() || "", cancellationBlock]
    .filter(Boolean)
    .join("\n\n");
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

export function findExternalReservationCandidate<
  Candidate extends ExternalReservationCandidate,
>({
  candidates,
  source,
  reservationNumber,
}: {
  candidates: Candidate[];
  source: MailSyncSource;
  reservationNumber: string;
}): Candidate | null {
  const reservationKey = source === "minimo" ? "ミニモ予約ID" : "HPB予約番号";
  const expectedLine = `${reservationKey}：${reservationNumber.trim()}`;
  const matches = candidates.filter((candidate) =>
    String(candidate.memo || "")
      .split(/\r?\n/)
      .some((line) => line.trim() === expectedLine)
  );

  if (matches.length > 1) {
    throw new Error(
      "同じ外部予約番号が複数の予約にあります。誤更新を避けるため同期を停止しました。"
    );
  }

  return matches[0] || null;
}

export function findManualReservationCandidate({
  candidates,
  source,
  staffId,
  customerId = null,
}: {
  candidates: ManualReservationCandidate[];
  source: MailSyncSource;
  staffId: string | null;
  customerId?: string | null;
}) {
  const matches = candidates.filter((candidate) => {
    if (isCancelledReservationStatus(candidate.status)) return false;
    if (staffId && candidate.staff_id !== staffId) return false;

    const text = normalize(`${candidate.menu || ""}\n${candidate.memo || ""}`);
    if (hasExternalReservationKey(text)) return false;

    if (hasSourceMarker(source, text)) return true;

    const hasAnySourceMarker =
      hasSourceMarker("hpb", text) || hasSourceMarker("minimo", text);

    return (
      Boolean(customerId) &&
      candidate.customer_id === customerId &&
      !hasAnySourceMarker
    );
  });

  if (matches.length > 1) {
    throw new Error(
      "同時刻に未照合の外部予約が複数あります。重複作成を避けるため同期を停止しました。"
    );
  }

  return matches[0] || null;
}
