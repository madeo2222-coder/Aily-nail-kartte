export function buildExternalReservationMemo(
  source: string,
  memo: string
): string | null {
  const normalizedSource = source.trim();
  const normalizedMemo = memo.trim();
  const lines = [
    normalizedSource ? `外部予約種別：${normalizedSource}` : "",
    normalizedMemo,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : null;
}
