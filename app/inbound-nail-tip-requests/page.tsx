import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import StatusForm from "./StatusForm";

export const dynamic = "force-dynamic";

type InboundNailTipRequestRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  country: string | null;
  instagram_id: string | null;
  language: string | null;
  design_request: string | null;
  image_urls: string[] | null;
  status: string | null;
  created_at: string | null;
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

export default async function InboundNailTipRequestsPage() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("inbound_nail_tip_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const requests = ((data || []) as InboundNailTipRequestRow[]) || [];

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
            インバウンドページから届いたアニメ・キャラネイルチップ相談を確認します。
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

        {error ? (
          <section className="rounded-3xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-700">
            取得エラー：{error.message}
          </section>
        ) : null}

        {requests.length === 0 ? (
          <section className="rounded-3xl border bg-white p-5 text-sm font-bold text-slate-500 shadow-sm">
            まだ相談はありません。
          </section>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
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
                    </div>

                    <div className="rounded-full bg-pink-100 px-4 py-2 text-sm font-bold text-pink-700">
                      {getStatusLabel(request.status)}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
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