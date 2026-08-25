"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DiagnosisApiResult } from "@/lib/sanmeigaku/types";

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  {
    key: "diagnosis",
    label: "診断",
    icon: "✨",
    href: "/customer-app/sanmeigaku",
  },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "mypage", label: "マイ", icon: "👤", href: "/customer-app/mypage" },
];

function formatDate(value: string | null) {
  if (!value) return "未登録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未登録";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildTipOrderHref(diagnosis: DiagnosisApiResult) {
  const params = new URLSearchParams({
    color: diagnosis.luckyColor,
    stone: diagnosis.luckyStone,
    theme: diagnosis.nailTheme,
  });
  return `/customer-app/nail-tip-order?${params.toString()}`;
}

export default function SanmeigakuDiagnosisResultPage() {
  const params = useParams<{ id: string }>();
  const diagnosisId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [diagnosis, setDiagnosis] = useState<DiagnosisApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function fetchDiagnosis() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/sanmeigaku-diagnoses/${encodeURIComponent(diagnosisId)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const json = (await response.json()) as {
          ok?: boolean;
          diagnosis?: DiagnosisApiResult;
          error?: string;
        };

        if (!response.ok || !json.ok || !json.diagnosis) {
          setErrorMessage(json.error || "診断結果を表示できませんでした");
          return;
        }

        setDiagnosis(json.diagnosis);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setErrorMessage("診断結果の取得中に通信エラーが発生しました");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    if (diagnosisId) void fetchDiagnosis();
    else {
      setErrorMessage("診断結果が見つかりません");
      setLoading(false);
    }

    return () => controller.abort();
  }, [diagnosisId]);

  const tipOrderHref = useMemo(
    () => (diagnosis ? buildTipOrderHref(diagnosis) : "/customer-app/nail-tip-order"),
    [diagnosis]
  );

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">
            あなたらしさを彩る
            <br />
            簡易ネイル提案
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            保存済みの診断結果を表示しています。
          </p>
        </section>

        {loading ? (
          <section className="rounded-3xl border bg-white p-6 text-sm text-slate-600 shadow-sm">
            診断結果を読み込んでいます...
          </section>
        ) : null}

        {!loading && errorMessage ? (
          <section className="rounded-3xl border border-rose-200 bg-white p-5 shadow-sm">
            <div className="text-base font-bold text-rose-700">{errorMessage}</div>
            <Link
              href="/customer-app/sanmeigaku"
              className="mt-4 block rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
            >
              診断入力へ戻る
            </Link>
          </section>
        ) : null}

        {!loading && diagnosis ? (
          <>
            <section className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-bold text-slate-900">診断結果</div>
                <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-600">
                  {formatDate(diagnosis.createdAt)}
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-purple-50 p-4 text-sm font-bold leading-7 text-purple-800">
                {diagnosis.message}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="rounded-2xl bg-pink-50 p-4">
                  <div className="text-xs text-pink-500">おすすめカラー</div>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {diagnosis.luckyColor}
                  </div>
                </div>
                <div className="rounded-2xl bg-violet-50 p-4">
                  <div className="text-xs text-violet-500">おすすめストーン</div>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {diagnosis.luckyStone}
                  </div>
                </div>
                <div className="rounded-2xl bg-amber-50 p-4">
                  <div className="text-xs text-amber-600">ネイルの方向性</div>
                  <div className="mt-1 text-sm font-bold leading-6 text-slate-900">
                    {diagnosis.nailTheme}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="text-base font-bold text-slate-900">今回のご希望</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">意識したいテーマ</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {diagnosis.requestedFortune}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">好きな雰囲気</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {diagnosis.preferredMood}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-400">
                計算バージョン：{diagnosis.calculationVersion}
              </div>
            </section>

            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800 shadow-sm">
              この結果は娯楽を目的とした固定ルールによる簡易ネイル提案です。正式な算命学鑑定や、医療・法律・投資等の判断を目的とするものではありません。
            </section>

            <div className="grid grid-cols-1 gap-2">
              <Link
                href={tipOrderHref}
                className="block rounded-2xl bg-purple-600 px-4 py-3 text-center text-sm font-bold text-white shadow"
              >
                この内容でネイルチップ注文する
              </Link>
              <Link
                href="/customer-app/reserve?menu=開運ネイル相談"
                className="block rounded-2xl border border-rose-200 bg-white px-4 py-3 text-center text-sm font-bold text-rose-600"
              >
                店舗で施術予約する
              </Link>
              <Link
                href="/customer-app/sanmeigaku"
                className="block rounded-2xl border bg-white px-4 py-3 text-center text-sm font-bold text-slate-700"
              >
                もう一度診断する
              </Link>
            </div>
          </>
        ) : null}
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                item.key === "diagnosis"
                  ? "bg-purple-50 text-purple-500"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="mt-1 leading-none">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </main>
  );
}
