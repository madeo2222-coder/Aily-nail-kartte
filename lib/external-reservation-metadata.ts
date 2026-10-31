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

export type ExternalReservationProvider = "hpb" | "minimo";

export function detectExternalReservationProvider({
  source,
  memo,
}: {
  source?: string | null;
  memo?: string | null;
}): ExternalReservationProvider | null {
  const normalizedSource = (source || "").normalize("NFKC").toLowerCase();
  const normalizedMemo = (memo || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

  if (
    normalizedSource.includes("hpb") ||
    normalizedSource.includes("hotpepper") ||
    normalizedSource.includes("hot pepper")
  ) {
    return "hpb";
  }

  if (
    normalizedSource.includes("minimo") ||
    normalizedSource.includes("ミニモ")
  ) {
    return "minimo";
  }

  if (normalizedMemo.includes("hpb予約番号")) return "hpb";
  if (normalizedMemo.includes("ミニモ予約id")) return "minimo";

  return null;
}

function detectManualExternalReservationProvider(
  memo?: string | null
): ExternalReservationProvider | null {
  const sourceLine = (memo || "")
    .normalize("NFKC")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!sourceLine || !/^外部予約種別\s*:/i.test(sourceLine)) return null;

  const value = sourceLine
    .replace(/^外部予約種別\s*:\s*/i, "")
    .trim()
    .toLowerCase();

  if (
    value === "hpb" ||
    value === "hotpepper" ||
    value === "hot pepper" ||
    value === "ホットペッパー"
  ) {
    return "hpb";
  }

  if (value === "minimo" || value === "ミニモ") {
    return "minimo";
  }

  return null;
}

/**
 * Calendar display may identify a manual external reservation by the
 * structured marker written by the staff form. Keep that marker out of the
 * synced-reservation detector so staff can still edit or delete the entry.
 */
export function detectExternalReservationDisplayProvider(metadata: {
  source?: string | null;
  memo?: string | null;
}): ExternalReservationProvider | null {
  return (
    detectExternalReservationProvider(metadata) ||
    detectManualExternalReservationProvider(metadata.memo)
  );
}

export function isExternalSyncedReservation(metadata: {
  source?: string | null;
  memo?: string | null;
}) {
  return detectExternalReservationProvider(metadata) !== null;
}
