export type NailTipOrderSubmission = {
  luckyColor: string;
  luckyStone: string;
  nailTheme: string;
  productCode: string;
  designRequest: string;
  sizeStatus: string;
  deliveryRequest: string;
  requestKey: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const NAIL_TIP_ORDER_SUBMISSION_KEY =
  "aily.nailTipOrder.pendingSubmission";

const REQUEST_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSubmission(value: unknown): value is NailTipOrderSubmission {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const stringFields = [
    "luckyColor",
    "luckyStone",
    "nailTheme",
    "productCode",
    "designRequest",
    "sizeStatus",
    "deliveryRequest",
    "requestKey",
  ];

  return (
    stringFields.every((field) => typeof candidate[field] === "string") &&
    candidate.productCode !== "" &&
    REQUEST_KEY_PATTERN.test(String(candidate.requestKey))
  );
}

export function readPendingNailTipOrderSubmission(
  storage: StorageLike
): NailTipOrderSubmission | null {
  try {
    const raw = storage.getItem(NAIL_TIP_ORDER_SUBMISSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSubmission(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingNailTipOrderSubmission(
  storage: StorageLike,
  submission: NailTipOrderSubmission
) {
  if (!isSubmission(submission)) {
    throw new Error("注文の復旧情報が正しくありません");
  }
  storage.setItem(
    NAIL_TIP_ORDER_SUBMISSION_KEY,
    JSON.stringify(submission)
  );
}

export function clearPendingNailTipOrderSubmission(storage: StorageLike) {
  storage.removeItem(NAIL_TIP_ORDER_SUBMISSION_KEY);
}
