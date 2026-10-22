const MANUAL_MEMO_MARKER = "\n【同期前の手入力メモ】\n";
const SYNC_SOURCE_LABELS = ["HPB", "ミニモ"] as const;

export type EditableReservationMemo = {
  displayMemo: string;
  syncedMemo: string | null;
};

function findSyncBodyBoundary(memo: string) {
  for (const sourceLabel of SYNC_SOURCE_LABELS) {
    const boundary = `\n【${sourceLabel}メール本文】\n`;
    const index = memo.indexOf(boundary);

    if (index >= 0) {
      return { index, boundary };
    }
  }

  return null;
}

/**
 * Keeps the generated external-booking details out of the staff memo editor.
 * The complete synced memo is retained as an opaque template so saving an
 * unrelated reservation field cannot discard the imported mail body.
 */
export function readEditableReservationMemo(
  memo: string | null | undefined,
): EditableReservationMemo {
  const normalized = String(memo || "").replace(/\r\n?/g, "\n");
  const bodyBoundary = findSyncBodyBoundary(normalized);

  if (!bodyBoundary) {
    return { displayMemo: normalized, syncedMemo: null };
  }

  const header = normalized.slice(0, bodyBoundary.index);
  const markerIndex = header.indexOf(MANUAL_MEMO_MARKER);
  const displayMemo =
    markerIndex < 0
      ? ""
      : header.slice(markerIndex + MANUAL_MEMO_MARKER.length).trim();

  return { displayMemo, syncedMemo: normalized };
}

/** Replace only the staff-owned section and leave sync metadata/body intact. */
export function writeEditableReservationMemo(
  syncedMemo: string,
  displayMemo: string,
) {
  const normalized = syncedMemo.replace(/\r\n?/g, "\n");
  const bodyBoundary = findSyncBodyBoundary(normalized);

  if (!bodyBoundary) return displayMemo.trim();

  const header = normalized.slice(0, bodyBoundary.index);
  const markerIndex = header.indexOf(MANUAL_MEMO_MARKER);
  const generatedHeader = (
    markerIndex < 0 ? header : header.slice(0, markerIndex)
  ).trimEnd();
  const staffMemo = displayMemo.trim();
  const nextHeader = [
    generatedHeader,
    staffMemo ? "【同期前の手入力メモ】" : "",
    staffMemo,
  ]
    .filter(Boolean)
    .join("\n");

  return `${nextHeader}${normalized.slice(bodyBoundary.index)}`;
}
