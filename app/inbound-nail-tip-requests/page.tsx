import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import StatusForm from "./StatusForm";
import QuoteForm from "./QuoteForm";
import SendQuoteButton from "./SendQuoteButton";
import PaymentUrlForm from "./PaymentUrlForm";
import MarkPaidButton from "./MarkPaidButton";
import ShippingForm from "./ShippingForm";
import StartMakingButton from "./StartMakingButton";
import CompleteButton from "./CompleteButton";

export const dynamic = "force-dynamic";

type InboundNailTipRequestRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  country: string | null;
  instagram_id: string | null;
  language: string | null;
  order_type: string | null;
  design_request: string | null;
  image_urls: string[] | null;
  status: string | null;
  quote_amount: number | null;
  payment_status: string | null;
  shipping_company: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  created_at: string | null;
  recipient_name: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_phone: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase環境変数不足");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
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

function formatYen(value: number | null) {
  if (!value || value <= 0) return "未設定";
  return `¥${value.toLocaleString("ja-JP")}`;
}

function getStatusLabel(status: string | null) {
  switch (status) {
    case "new":
      return "新規";
    case "reviewing":
      return "確認中";
    case "quoted":
      return "見積済み";
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

function getPaymentStatusLabel(status: string | null) {
  switch (status) {
    case "unpaid":
      return "未払い";
    case "paid":
      return "支払済み";
    default:
      return status || "未設定";
  }
}

function getOrderTypeLabel(orderType: string | null) {
  switch (orderType) {
    case "anime_character":
      return "🎨 アニメネイル";
    case "fortune_sanmeigaku":
      return "🔮 算命学ネイル";
    case "power_stone":
      return "💎 パワーストーンネイル";
    case "other":
      return "✨ その他カスタム";
    default:
      return "🎨 アニメネイル";
  }
}

function getOrderTypeClassName(orderType: string | null) {
  switch (orderType) {
    case "fortune_sanmeigaku":
      return "bg-purple-100 text-purple-700";
    case "power_stone":
      return "bg-blue-100 text-blue-700";
    case "other":
      return "bg-slate-100 text-slate-700";
    case "anime_character":
    default:
      return "bg-pink-100 text-pink-700";
  }
}

export default async function InboundNailTipRequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const supabase = getSupabaseAdmin();

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const view = resolvedSearchParams.view || "active";

  const { data, error } = await supabase
    .from("inbound_nail_tip_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const requests = ((data || []) as InboundNailTipRequestRow[]) || [];

  const activeRequests = requests.filter(
    (request) =>
      request.status !== "completed" && request.status !== "cancelled"
  );

  const completedRequests = requests.filter(
    (request) => request.status === "completed"
  );

  const displayRequests =
    view === "all"
      ? requests
      : view === "completed"
        ? completedRequests
        : activeRequests;

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto w-full max-w-[960px] space-y-4 p-4">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-pink-600 via-purple-500 to-orange-400 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            AILY NAIL STUDIO
          </p>
          <h1 className="mt-2 text-2xl font-black">
            海外発送ネイルチップ相談
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/90">
            インバウンドページから届いたネイルチップ相談を確認します。
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm"
          >
            ダッシュボードへ
          </Link>
          <Link
            href="/customer-app/inbound"
            className="rounded-2xl bg-pink-600 px-4 py-3 text-sm font-bold text-white shadow-sm"
          >
            受付ページ確認
          </Link>
        </div>

        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-amber-50 p-4">
            <div className="text-xs text-amber-700">進行中</div>
            <div className="mt-1 text-2xl font-black text-amber-900">
              {activeRequests.length}
            </div>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-4">
            <div className="text-xs text-emerald-700">完了</div>
            <div className="mt-1 text-2xl font-black text-emerald-900">
              {completedRequests.length}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-100 p-4">
            <div className="text-xs text-slate-600">総数</div>
            <div className="mt-1 text-2xl font-black text-slate-900">
              {requests.length}
            </div>
          </div>
        </section>

        <section className="flex flex-wrap gap-2">
          <Link
            href="/inbound-nail-tip-requests"
            className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-sm ${
              view === "active"
                ? "bg-pink-600 text-white"
                : "border bg-white text-slate-700"
            }`}
          >
            進行中を見る
          </Link>

          <Link
            href="/inbound-nail-tip-requests?view=completed"
            className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-sm ${
              view === "completed"
                ? "bg-pink-600 text-white"
                : "border bg-white text-slate-700"
            }`}
          >
            完了を見る
          </Link>

          <Link
            href="/inbound-nail-tip-requests?view=all"
            className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-sm ${
              view === "all"
                ? "bg-pink-600 text-white"
                : "border bg-white text-slate-700"
            }`}
          >
            全件を見る
          </Link>
        </section>

        {error ? (
          <section className="rounded-3xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-700">
            取得エラー：{error.message}
          </section>
        ) : null}

        {displayRequests.length === 0 ? (
          <section className="rounded-3xl border bg-white p-5 text-sm font-bold text-slate-500 shadow-sm">
            まだ相談はありません。
          </section>
        ) : (
          <div className="space-y-4">
            {displayRequests.map((request) => {
              const imageUrls = Array.isArray(request.image_urls)
                ? request.image_urls
                : [];

              return (
                <section
                  key={request.id}
                  className="rounded-3xl border bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-400">
                        {formatDateTime(request.created_at)}
                      </div>
                      <div className="mt-1 text-xl font-black text-slate-900">
                        {request.customer_name || "名前未登録"}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {request.country || "国未登録"} /{" "}
                        {request.language || "言語未登録"}
                      </div>
                      <div
                        className={`mt-3 inline-flex rounded-full px-4 py-2 text-xs font-black ${getOrderTypeClassName(
                          request.order_type
                        )}`}
                      >
                        {getOrderTypeLabel(request.order_type)}
                      </div>
                    </div>

                    <div className="rounded-full bg-pink-100 px-4 py-2 text-sm font-bold text-pink-700">
                      {getStatusLabel(request.status)}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">メール</div>
                      <a
                        href={`mailto:${request.customer_email || ""}`}
                        className="mt-1 block break-all text-sm font-bold text-slate-900"
                      >
                        {request.customer_email || "未登録"}
                      </a>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">Instagram</div>
                      <div className="mt-1 break-all text-sm font-bold text-slate-900">
                        {request.instagram_id || "未登録"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-amber-50 p-4">
                      <div className="text-xs text-amber-700">見積金額</div>
                      <div className="mt-1 text-lg font-black text-amber-900">
                        {formatYen(request.quote_amount)}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-emerald-50 p-4">
                      <div className="text-xs text-emerald-700">支払状況</div>
                      <div className="mt-1 text-sm font-black text-emerald-900">
                        {getPaymentStatusLabel(request.payment_status)}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-purple-50 p-4 md:col-span-3">
                      <div className="text-xs text-purple-700">配送先情報</div>

                      <div className="mt-2 text-sm font-bold leading-6 text-purple-950">
                        Recipient：{request.recipient_name || "未登録"}
                        <br />
                        Address：{request.shipping_address || "未登録"}
                        <br />
                        City：{request.shipping_city || "未登録"}
                        <br />
                        State：{request.shipping_state || "-"}
                        <br />
                        Postal Code：
                        {request.shipping_postal_code || "未登録"}
                        <br />
                        Phone：{request.shipping_phone || "未登録"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-blue-50 p-4 md:col-span-2">
                      <div className="text-xs text-blue-700">発送情報</div>
                      <div className="mt-1 text-sm font-bold leading-6 text-blue-950">
                        配送会社：{request.shipping_company || "未登録"}
                        <br />
                        追跡番号：{request.tracking_number || "未登録"}
                        <br />
                        発送日時：{formatDateTime(request.shipped_at)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-pink-50 p-4">
                    <div className="text-xs font-bold text-pink-600">
                      相談内容
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                      {request.design_request || "未入力"}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm font-bold text-slate-900">
                      参考画像
                    </div>

                    {imageUrls.length === 0 ? (
                      <div className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                        画像なし
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {imageUrls.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="overflow-hidden rounded-2xl border bg-slate-50"
                          >
                            <img
                              src={url}
                              alt="参考画像"
                              className="h-56 w-full object-cover"
                            />
                            <div className="break-all px-3 py-2 text-xs text-slate-500">
                              画像を開く
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {request.status === "new" && (
                    <>
                      <QuoteForm
                        requestId={request.id}
                        defaultAmount={request.quote_amount}
                      />

                      <SendQuoteButton requestId={request.id} />
                    </>
                  )}

                  {request.status === "quoted" && (
                    <>
                      <PaymentUrlForm />
                      <SendQuoteButton requestId={request.id} />
                    </>
                  )}

                  {request.status === "payment_waiting" && (
                    <MarkPaidButton requestId={request.id} />
                  )}

                  {request.status === "paid" && (
                    <StartMakingButton requestId={request.id} />
                  )}

                  {request.status === "making" && (
                    <ShippingForm
                      requestId={request.id}
                      defaultShippingCompany={request.shipping_company}
                      defaultTrackingNumber={request.tracking_number}
                    />
                  )}

                  {request.status === "shipped" && (
                    <CompleteButton requestId={request.id} />
                  )}

                  <StatusForm
                    requestId={request.id}
                    defaultStatus={request.status}
                  />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
