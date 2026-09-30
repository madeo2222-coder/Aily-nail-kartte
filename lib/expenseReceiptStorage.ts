export const EXPENSE_RECEIPT_BUCKET = "visit-photos";

const RECEIPT_PUBLIC_PATH = `/storage/v1/object/public/${EXPENSE_RECEIPT_BUCKET}/`;

export function getExpenseReceiptStoragePath(
  receiptUrl: string | null | undefined,
  supabaseUrl: string | null | undefined
) {
  if (!receiptUrl || !supabaseUrl) return null;

  try {
    const parsedReceiptUrl = new URL(receiptUrl);
    const configuredOrigin = new URL(supabaseUrl).origin;

    if (parsedReceiptUrl.origin !== configuredOrigin) return null;

    if (!parsedReceiptUrl.pathname.startsWith(RECEIPT_PUBLIC_PATH)) return null;

    const encodedPath = parsedReceiptUrl.pathname.slice(RECEIPT_PUBLIC_PATH.length);
    if (!encodedPath) return null;

    return encodedPath
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
}
