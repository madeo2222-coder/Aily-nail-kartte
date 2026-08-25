type PaymentHistoryStatus = "processing" | "pending" | "paid" | "failed";

type OrderPaymentFormProps = {
  orderId: string;
  productCode?: string | null;
  productName?: string | null;
  productPrice?: number | null;
  paymentStatus?: string | null;
  defaultPaymentUrl?: string | null;
  defaultTransactionId?: string | null;
  defaultPaymentDueAt?: string | null;
  paidAt?: string | null;
  latestPaymentStatus?: PaymentHistoryStatus | null;
  latestVeriTransOrderId?: string | null;
  paymentHistoryLoadFailed?: boolean;
};

function formatDateTime(value?: string | null) {
  if (!value) return "未登録";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未登録";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getPaymentState(params: {
  paymentStatus?: string | null;
  latestPaymentStatus?: PaymentHistoryStatus | null;
}) {
  if (params.paymentStatus === "paid" || params.latestPaymentStatus === "paid") {
    return { label: "支払済み", className: "bg-emerald-100 text-emerald-700" };
  }
  if (params.latestPaymentStatus === "processing") {
    return { label: "決済処理中", className: "bg-blue-100 text-blue-700" };
  }
  if (params.latestPaymentStatus === "pending") {
    return { label: "結果確認中", className: "bg-amber-100 text-amber-700" };
  }
  if (params.latestPaymentStatus === "failed") {
    return { label: "決済失敗", className: "bg-red-100 text-red-700" };
  }
  if (params.paymentStatus === "payment_waiting") {
    return { label: "支払待ち", className: "bg-purple-100 text-purple-700" };
  }
  return { label: "未生成", className: "bg-slate-100 text-slate-700" };
}

export default function OrderPaymentForm({
  productName,
  productPrice,
  paymentStatus,
  defaultTransactionId,
  defaultPaymentDueAt,
  paidAt,
  latestPaymentStatus,
  latestVeriTransOrderId,
  paymentHistoryLoadFailed = false,
}: OrderPaymentFormProps) {
  const paymentState = getPaymentState({ paymentStatus, latestPaymentStatus });
  const isPaid =
    paymentStatus === "paid" || latestPaymentStatus === "paid";

  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-bold text-slate-900">決済情報</div>
        <div
          className={`rounded-full px-4 py-2 text-sm font-bold ${paymentState.className}`}
        >
          {paymentState.label}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        カード決済は現在準備中です。決済URLの生成・表示・コピーは停止しています。
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-purple-50 p-4">
          <div className="text-xs text-purple-500">商品名</div>
          <div className="mt-1 font-bold text-purple-900">
            {productName || "未登録"}
          </div>
        </div>
        <div className="rounded-2xl bg-amber-50 p-4">
          <div className="text-xs text-amber-600">サーバー確定価格</div>
          <div className="mt-1 font-bold text-amber-900">
            {Number.isInteger(productPrice) && Number(productPrice) > 0
              ? `¥${Number(productPrice).toLocaleString("ja-JP")}`
              : "未登録"}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">保存済み支払期限</div>
          <div className="mt-1 font-bold text-slate-900">
            {formatDateTime(defaultPaymentDueAt)}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">過去の取引ID</div>
          <div className="mt-1 break-all font-bold text-slate-900">
            {latestVeriTransOrderId || defaultTransactionId || "未登録"}
          </div>
        </div>
        {isPaid ? (
          <div className="rounded-2xl bg-emerald-50 p-4 md:col-span-2">
            <div className="text-xs text-emerald-600">支払完了日時</div>
            <div className="mt-1 font-bold text-emerald-900">
              {formatDateTime(paidAt)}
            </div>
          </div>
        ) : null}
      </div>

      {paymentHistoryLoadFailed ? (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          過去の決済履歴を確認できませんでした。
        </div>
      ) : null}
    </section>
  );
}
