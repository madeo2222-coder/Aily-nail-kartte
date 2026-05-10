"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "diagnosis", label: "診断", icon: "✨", href: "/customer-app/sanmeigaku" },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "mypage", label: "マイ", icon: "👤", href: "" },
];

function NailTipOrderContent() {
  const searchParams = useSearchParams();

  const color = searchParams.get("color") || "未選択";
  const stone = searchParams.get("stone") || "未選択";
  const theme = searchParams.get("theme") || "未選択";

  const [message, setMessage] = useState("");
  const [designRequest, setDesignRequest] = useState("");
  const [sizeStatus, setSizeStatus] = useState("サイズ未確認");
  const [deliveryRequest, setDeliveryRequest] = useState("");

  const summaryText = useMemo(() => {
    return `${color} / ${stone} / ${theme}`;
  }, [color, stone, theme]);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  function handleSubmit() {
    showMessage("ネイルチップ注文受付は次段階でDB保存します");
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">
            開運ネイルチップ注文
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            算命学ネイル診断の結果をもとに、あなたに合わせた開運ネイルチップを相談・注文できます。
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            診断からのおすすめ内容
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-purple-50 p-4">
              <div className="text-xs text-purple-500">ラッキーカラー</div>
              <div className="mt-1 text-lg font-bold text-purple-900">
                {color}
              </div>
            </div>

            <div className="rounded-2xl bg-pink-50 p-4">
              <div className="text-xs text-pink-500">ラッキーストーン</div>
              <div className="mt-1 text-lg font-bold text-pink-900">
                {stone}
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50 p-4">
              <div className="text-xs text-amber-600">おすすめ方向性</div>
              <div className="mt-1 text-sm font-bold leading-6 text-amber-900">
                {theme}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {summaryText}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            注文希望内容
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                デザイン希望・雰囲気
              </label>
              <textarea
                value={designRequest}
                onChange={(e) => setDesignRequest(e.target.value)}
                rows={4}
                placeholder="例：派手すぎない上品系、仕事でも使える、ストーンは控えめ等"
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                チップサイズ
              </label>
              <select
                value={sizeStatus}
                onChange={(e) => setSizeStatus(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                <option value="サイズ未確認">サイズ未確認</option>
                <option value="サイズ測定済み">サイズ測定済み</option>
                <option value="サイズ確認キット希望">サイズ確認キット希望</option>
                <option value="過去注文と同じサイズ">過去注文と同じサイズ</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                配送・納期希望
              </label>
              <textarea
                value={deliveryRequest}
                onChange={(e) => setDeliveryRequest(e.target.value)}
                rows={3}
                placeholder="例：急ぎではない、〇日までに欲しい、ギフト用等"
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              className="w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-bold text-white"
            >
              この内容で注文相談する
            </button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            店舗施術もできます
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            実際に店舗で施術を受けたい場合は、開運ネイル相談として予約できます。
          </p>

          <Link
            href="/customer-app/reserve?menu=開運ネイル相談"
            className="mt-4 block rounded-2xl border border-rose-200 bg-white px-4 py-3 text-center text-sm font-bold text-rose-600"
          >
            店舗で施術予約する
          </Link>
        </section>
      </div>

      {message ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-24px)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-blue-700">{message}</div>
              <button
                type="button"
                onClick={() => setMessage("")}
                className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-bold text-blue-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => {
            const isActive = item.key === "diagnosis";

            if (item.href) {
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                    isActive
                      ? "bg-purple-50 text-purple-500"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span className="mt-1 leading-none">{item.label}</span>
                </Link>
              );
            }

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => showMessage(`${item.label} 画面は次段階で実装します`)}
                className="flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium text-gray-500 transition hover:text-gray-800"
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="mt-1 leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

export default function NailTipOrderPage() {
  return (
    <Suspense fallback={null}>
      <NailTipOrderContent />
    </Suspense>
  );
}