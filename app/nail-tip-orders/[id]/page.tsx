import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import OrderPaymentForm from "./OrderPaymentForm";
import OrderStatusForm from "./OrderStatusForm";
import OrderShippingForm from "./OrderShippingForm";
export const dynamic = "force-dynamic";

type NailTipOrderRow = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  lucky_color: string | null;
  lucky_stone: string | null;
  nail_theme: string | null;
  design_request: string | null;
  size_status: string | null;
  delivery_request: string | null;
  status: string | null;
  created_at: string | null;
  payment_url: string | null;
  payment_transaction_id: string | null;
  payment_status: string | null;
  payment_due_at: string | null;
  paid_at: string | null;
  product_code: string | null;
  product_name_snapshot: string | null;
  product_price: number | null;
  shipping_company: string | null;
　tracking_number: string | null;
　shipped_at: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
};

type NailTipOrderPaymentRow = {
  order_id: string;
  status: "processing" | "pending" | "paid" | "failed";
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase環境変数が不足しています");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function formatDateTime(value: string | null) {
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
  }).format(date);
}

function getStatusLabel(status: string | null) {
  switch (status) {
    case "requested":
      return "注文相談中";
    case "payment_waiting":
      return "支払待ち";
    case "paid":
      return "支払済み";
    case "making":
      return "制作中";
    case "shipped":
      return "発送済み";
    case "completed":
      return "完了";
    case "cancelled":
      return "キャンセル";
    default:
      return status || "未設定";
  }
}

function extractLine(text: string | null, label: string) {
  if (!text) return "";

  const line = text
    .split("\n")
    .find((item) => item.trim().startsWith(label));

  return line?.replace(label, "").trim() || "";
}

export default async function NailTipOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: orderData, error: orderError } = await supabase
    .from("nail_tip_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (orderError || !orderData) {
    return (
      <main className="min-h-screen bg-purple-50/40">
        <div className="mx-auto w-full max-w-[920px] space-y-4 p-4 pb-24">
          <section className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="text-lg font-bold text-slate-900">
              注文が見つかりません
            </div>
            <Link
              href="/nail-tip-orders"
              className="mt-4 block rounded-2xl bg-purple-600 px-4 py-3 text-center text-sm font-bold text-white"
            >
              注文一覧へ戻る
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const order = orderData as NailTipOrderRow;

  let customer: CustomerRow | null = null;

  if (order.customer_id) {
    const { data: customerData } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("id", order.customer_id)
      .maybeSingle();

    customer = (customerData as CustomerRow | null) || null;
  }

  const {
    data: latestPaymentData,
    error: latestPaymentError,
  } = await supabase
    .from("nail_tip_order_payments")
    .select("order_id, status")
    .eq("nail_tip_order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<NailTipOrderPaymentRow>();

  const productName = extractLine(order.design_request, "選択商品：");
  const savedProductPrice = extractLine(order.design_request, "商品価格：");
  const estimatedProductPrice = extractLine(order.design_request, "価格目安：");
  const isAwaitingFormalQuote = Boolean(
    order.design_request
      ?.split("\n")
      .some((line) => line.trim() === "正式見積り前")
  );
  const productPrice =
    typeof order.product_price === "number" && order.product_price > 0
      ? `¥${order.product_price.toLocaleString("ja-JP")}`
      : estimatedProductPrice || savedProductPrice || "未登録";
  const productStone = extractLine(order.design_request, "商品ストーン：");
  const productTheme = extractLine(order.design_request, "商品テーマ：");

  return (
    <main className="min-h-screen bg-purple-50/40">
      <div className="mx-auto w-full max-w-[920px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            NAILY AIDOL
          </p>

          <h1 className="mt-2 text-2xl font-bold">
            ネイルチップ注文詳細
          </h1>

          <p className="mt-2 text-sm text-white/90">注文ID：{order.id}</p>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-slate-500">顧客名</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {customer?.name || "顧客名未設定"}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {customer?.phone || "電話番号未登録"}
              </div>
            </div>

            <div className="rounded-full bg-purple-100 px-4 py-2 text-sm font-bold text-purple-700">
              {getStatusLabel(order.status)}
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-400">
            注文日時：{formatDateTime(order.created_at)}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-lg font-bold text-slate-900">商品情報</div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-purple-50 p-4">
              <div className="text-xs text-purple-500">商品名</div>
              <div className="mt-1 font-bold text-purple-900">
                {productName || "未登録"}
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50 p-4">
              <div className="text-xs text-amber-600">
                {isAwaitingFormalQuote ? "価格目安" : "商品価格"}
              </div>
              <div className="mt-1 font-bold text-amber-900">
                {productPrice}
              </div>
              {isAwaitingFormalQuote ? (
                <div className="mt-1 text-xs font-bold text-amber-700">
                  正式見積り前
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl bg-pink-50 p-4">
              <div className="text-xs text-pink-500">商品ストーン</div>
              <div className="mt-1 font-bold text-pink-900">
                {productStone || "未登録"}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">商品テーマ</div>
              <div className="mt-1 font-bold text-slate-900">
                {productTheme || "未登録"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-lg font-bold text-slate-900">診断結果</div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-purple-50 p-4">
              <div className="text-xs text-purple-500">ラッキーカラー</div>
              <div className="mt-1 font-bold text-purple-900">
                {order.lucky_color || "未登録"}
              </div>
            </div>

            <div className="rounded-2xl bg-pink-50 p-4">
              <div className="text-xs text-pink-500">ラッキーストーン</div>
              <div className="mt-1 font-bold text-pink-900">
                {order.lucky_stone || "未登録"}
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50 p-4">
              <div className="text-xs text-amber-600">開運テーマ</div>
              <div className="mt-1 font-bold leading-6 text-amber-900">
                {order.nail_theme || "未登録"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-lg font-bold text-slate-900">注文内容</div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">デザイン希望</div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {order.design_request || "未入力"}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">サイズ状態</div>
              <div className="mt-1 font-bold text-slate-900">
                {order.size_status || "未設定"}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">配送・納期希望</div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {order.delivery_request || "未入力"}
              </div>
            </div>
          </div>
        </section>

        <OrderStatusForm orderId={order.id} defaultStatus={order.status} />

        <OrderPaymentForm
          orderId={order.id}
          productCode={order.product_code}
          productName={order.product_name_snapshot}
          productPrice={order.product_price}
          paymentStatus={order.payment_status}
          defaultPaymentUrl={order.payment_url}
          defaultTransactionId={order.payment_transaction_id}
          defaultPaymentDueAt={order.payment_due_at}
          paidAt={order.paid_at}
          latestPaymentStatus={latestPaymentData?.status || null}
          latestVeriTransOrderId={latestPaymentData?.order_id || null}
          paymentHistoryLoadFailed={Boolean(latestPaymentError)}
        />
<OrderShippingForm
  orderId={order.id}
  defaultShippingCompany={order.shipping_company}
  defaultTrackingNumber={order.tracking_number}
  defaultShippedAt={order.shipped_at}
/>
        <Link
          href="/nail-tip-orders"
          className="block rounded-2xl bg-purple-600 px-4 py-3 text-center text-sm font-bold text-white"
        >
          注文一覧へ戻る
        </Link>
      </div>
    </main>
  );
}
