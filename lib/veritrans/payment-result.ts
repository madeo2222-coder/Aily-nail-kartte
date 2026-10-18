// DGFT: https://www.veritrans.co.jp/docs/mdk_guide/result_list.html
// A transport error can occur after a charge succeeds. Unknown results must
// retain the active-payment lock until Search/MAP reconciliation is completed.
const CONFIRMED_CARD_DECLINES = new Set([
  "ACP5", "ACZZ", "AG33", "AG48", "AG64", "AG65", "AG69", "AG70",
]);

export const PAYMENT_REVIEW_MESSAGE =
  "決済結果を確認中です。再度お支払いせず、店舗へお問い合わせください。";

export function getUnsuccessfulCardPaymentStatus(result: {
  mstatus: string | null;
  pending: string | null;
  responseOrderId: string | null;
  vResultCode: string | null;
}, expectedOrderId: string): "pending" | "failed" {
  if (
    result.mstatus === "failure" &&
    result.pending === "0" &&
    result.responseOrderId === expectedOrderId &&
    result.vResultCode !== null &&
    /^[A-Z0-9]{4}0{12}$/.test(result.vResultCode) &&
    CONFIRMED_CARD_DECLINES.has(result.vResultCode.slice(0, 4))
  ) {
    return "failed";
  }
  return "pending";
}
