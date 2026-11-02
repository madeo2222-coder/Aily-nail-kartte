export type InboundNailTipSubmission = {
  customerName: string;
  customerEmail: string;
  country: string;
  instagramId: string;
  language: string;
  orderType: string;
  designRequest: string;
  imageUrls: string[];
  recipientName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingPhone: string;
};

export type PendingInboundNailTipSubmission = {
  operationId: string;
  submission: InboundNailTipSubmission;
};

type SubmissionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const inboundNailTipSubmissionStorageKey =
  "aily:inbound-nail-tip-submission:v1";

export function isUuidV4(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isSubmission(value: unknown): value is InboundNailTipSubmission {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const stringFields = [
    "customerName",
    "customerEmail",
    "country",
    "instagramId",
    "language",
    "orderType",
    "designRequest",
    "recipientName",
    "shippingAddress",
    "shippingCity",
    "shippingState",
    "shippingPostalCode",
    "shippingPhone",
  ];

  return (
    stringFields.every((field) => typeof candidate[field] === "string") &&
    Array.isArray(candidate.imageUrls) &&
    candidate.imageUrls.every((url) => typeof url === "string")
  );
}

export function readPendingInboundNailTipSubmission(
  storage: SubmissionStorage
): PendingInboundNailTipSubmission | null {
  try {
    const raw = storage.getItem(inboundNailTipSubmissionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isUuidV4(parsed.operationId) || !isSubmission(parsed.submission)) {
      clearPendingInboundNailTipSubmission(storage);
      return null;
    }
    return {
      operationId: parsed.operationId,
      submission: parsed.submission,
    };
  } catch {
    clearPendingInboundNailTipSubmission(storage);
    return null;
  }
}

export function savePendingInboundNailTipSubmission(
  storage: SubmissionStorage,
  pending: PendingInboundNailTipSubmission
) {
  if (!isUuidV4(pending.operationId) || !isSubmission(pending.submission)) {
    throw new Error("Invalid inbound nail-tip submission.");
  }
  storage.setItem(inboundNailTipSubmissionStorageKey, JSON.stringify(pending));
}

export function clearPendingInboundNailTipSubmission(
  storage: SubmissionStorage
) {
  try {
    storage.removeItem(inboundNailTipSubmissionStorageKey);
  } catch {
    // A saved server result remains authoritative even if local cleanup fails.
  }
}
