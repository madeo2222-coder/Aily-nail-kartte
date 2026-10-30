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
  start_at?: string | null;
  end_at?: string | null;
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

export function normalizeExternalReservationNumber(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
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
    .update(
      `aily:external-${kind}:${source}:${normalizeExternalReservationNumber(reservationNumber)}`
    )
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

// Read only the saved notes before the generated mail body, never the whole
// previous sync memo (which would grow recursively on every retry).
export function readSyncedManualMemo(memo: string | null | undefined, sourceLabel: string) {
  const text = String(memo || "").replace(/\r\n?/g, "\n");
  const bodyBoundary = text.indexOf(`\n【${sourceLabel}メール本文】\n`);
  if (bodyBoundary < 0) return "";
  const header = text.slice(0, bodyBoundary);
  const marker = "\n【同期前の手入力メモ】\n";
  const start = header.indexOf(marker);
  return start < 0 ? "" : header.slice(start + marker.length).trim();
}

export function hasSyncedMailBody({
  memo,
  sourceLabel,
  rawText,
}: {
  memo: string | null | undefined;
  sourceLabel: string;
  rawText: string;
}) {
  const text = String(memo || "").replace(/\r\n?/g, "\n");
  const normalizedRawText = rawText.replace(/\r\n?/g, "\n");
  const marker = `\n【${sourceLabel}メール本文】\n`;
  const start = text.indexOf(marker);

  return start >= 0 && text.slice(start + marker.length) === normalizedRawText;
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
  const expectedKey = normalize(reservationKey);
  const expectedReservationNumber =
    normalizeExternalReservationNumber(reservationNumber);
  const matches = candidates.filter((candidate) =>
    String(candidate.memo || "")
      .split(/\r?\n/)
      .some((line) => {
        const normalizedLine = line.trim().normalize("NFKC");
        const separatorIndex = normalizedLine.indexOf(":");
        if (separatorIndex < 0) return false;

        const key = normalize(normalizedLine.slice(0, separatorIndex));
        const candidateNumber = normalizeExternalReservationNumber(
          normalizedLine.slice(separatorIndex + 1)
        );

        return (
          key === expectedKey &&
          candidateNumber === expectedReservationNumber
        );
      })
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
  expectedEndAt = null,
  requireExactCustomerMatch = false,
  allowStaffMismatchForExactCustomer = false,
}: {
  candidates: ManualReservationCandidate[];
  source: MailSyncSource;
  staffId: string | null;
  customerId?: string | null;
  expectedEndAt?: string | null;
  requireExactCustomerMatch?: boolean;
  allowStaffMismatchForExactCustomer?: boolean;
}) {
  let hasConflictingSourceCandidate = false;
  const matches = candidates.filter((candidate) => {
    if (isCancelledReservationStatus(candidate.status)) return false;
    const text = normalize(`${candidate.menu || ""}\n${candidate.memo || ""}`);
    if (hasExternalReservationKey(text)) return false;
    const matchesSource = hasSourceMarker(source, text);

    // A staff member may enter the reservation before the provider mail
    // arrives without choosing an assignee yet. Let the later HPB/minimo mail
    // fill that blank assignment, while continuing to reject a row that is
    // already assigned to a different staff member.
    if (
      staffId &&
      candidate.staff_id != null &&
      candidate.staff_id !== staffId &&
      !(
        allowStaffMismatchForExactCustomer &&
        Boolean(customerId) &&
        candidate.customer_id === customerId
      )
    ) {
      if (requireExactCustomerMatch && matchesSource) {
        hasConflictingSourceCandidate = true;
      }
      return false;
    }

    if (matchesSource) {
      // A source marker, staff and time are still insufficient to identify the
      // guest for a cancellation. When the caller requires an exact match,
      // only the stable customer ID may select the manual row.
      if (
        requireExactCustomerMatch &&
        candidate.customer_id !== customerId
      ) {
        hasConflictingSourceCandidate = true;
        return false;
      }

      // Several external bookings can share the same five-minute window,
      // especially when the provider reports "no preference" and no staff ID
      // can narrow the lookup. Once the mail customer has been resolved, use
      // that stable link to choose the intended manual row. A source-marked
      // row already linked to another customer remains a hard conflict when
      // there is no safe candidate, so the caller never inserts a duplicate
      // beside it silently.
      if (
        customerId &&
        candidate.customer_id &&
        candidate.customer_id !== customerId
      ) {
        hasConflictingSourceCandidate = true;
        return false;
      }

      return true;
    }

    const hasAnySourceMarker =
      hasSourceMarker("hpb", text) || hasSourceMarker("minimo", text);

    return (
      Boolean(customerId) &&
      candidate.customer_id === customerId &&
      !hasAnySourceMarker
    );
  });

  // A stable customer link plus the same external source is stronger than an
  // otherwise matching source-marked row whose customer is still blank. This
  // can happen when staff entered two nearby bookings before the provider mail
  // arrived. Prefer the already linked row instead of treating the blank row
  // as equally ambiguous. Multiple equally strong rows still fail closed.
  const exactCustomerSourceMatches = customerId
    ? matches.filter((candidate) => {
        if (candidate.customer_id !== customerId) return false;
        const text = normalize(
          `${candidate.menu || ""}\n${candidate.memo || ""}`
        );
        return hasSourceMarker(source, text);
      })
    : [];
  const preferredMatches =
    exactCustomerSourceMatches.length > 0
      ? exactCustomerSourceMatches
      : matches;

  // Staff can enter two nearby bookings for the same customer before the
  // provider mail arrives (for example, a correction beside the original
  // row). The start-time query intentionally allows a five-minute input
  // difference, so use the provider's end time as an additional safe
  // discriminator only when the customer/source rules still leave multiple
  // candidates. A missing or invalid end time never weakens the existing
  // fail-closed behavior.
  let finalMatches = preferredMatches;
  if (preferredMatches.length > 1 && expectedEndAt) {
    const expectedEndMilliseconds = new Date(expectedEndAt).getTime();
    if (Number.isFinite(expectedEndMilliseconds)) {
      const toleranceMilliseconds =
        MANUAL_RESERVATION_TIME_TOLERANCE_MINUTES * 60 * 1000;
      const endAlignedMatches = preferredMatches.filter((candidate) => {
        const candidateEndMilliseconds = new Date(
          candidate.end_at || ""
        ).getTime();
        return (
          Number.isFinite(candidateEndMilliseconds) &&
          Math.abs(candidateEndMilliseconds - expectedEndMilliseconds) <=
            toleranceMilliseconds
        );
      });

      if (endAlignedMatches.length > 0) {
        finalMatches = endAlignedMatches;
      }
    }
  }

  if (finalMatches.length > 1) {
    throw new Error(
      "同時刻に未照合の外部予約が複数あります。重複作成を避けるため同期を停止しました。"
    );
  }

  if (finalMatches.length === 0 && hasConflictingSourceCandidate) {
    throw new Error(
      "手入力予約とメールの顧客が一致しません。誤更新を避けるため同期を停止しました。"
    );
  }

  return finalMatches[0] || null;
}
