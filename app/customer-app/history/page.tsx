"use client";

import Link from "next/link";

const visitHistory = [
  {
    id: "1",
    date: "2026/04/10",
    menu: "ワンカラー + フィルイン",
    staff: "山田",
    note: "春系ピンクの透明感カラーで仕上げています。",
    nextSuggestion: "次回は5月上旬〜中旬にメンテナンスがおすすめです。",
  },
  {
    id: "2",
    date: "2026/03/14",
    menu: "定額デザインコース",
    staff: "山田",
    note: "オフィス向けの上品なベージュ系デザインでした。",
    nextSuggestion: "次回はマグネット系の季節カラー提案がおすすめです。",
  },
  {
    id: "3",
    date: "2026/02/11",
    menu: "フットネイル + ケア",
    staff: "佐藤",
    note: "フットケアを含めたメンテナンス施術です。",
    nextSuggestion: "サンダル時期前にフット再来を提案できます。",
  },
];

const navItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "news", label: "お知らせ", icon: "📢", href: "" },
  { key: "mypage", label: "マイ", icon: "👤", href: "" },
];

export default function CustomerAppHistoryPage() {
  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">来店履歴</h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            前回までの施術内容や担当スタッフ、次回提案を確認できます。
          </p>

          <div className="mt-4 flex gap-2">
            <Link
              href="/customer-app"
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900"
            >
              マイページへ戻る
            </Link>
            <button
              type="button"
              className="rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white"
            >
              次回予約する
            </button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">履歴サマリー</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">累計来店回数</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {visitHistory.length}回
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回来店日</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {visitHistory[0]?.date}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">最近のおすすめ</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                フィルインメンテナンス / 季節カラー提案
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {visitHistory.map((item) => (
            <article key={item.id} className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-bold text-slate-900">{item.menu}</div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {item.date}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">担当スタッフ</div>
                  <div className="mt-1 text-base font-bold text-slate-900">
                    {item.staff}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">施術メモ</div>
                  <div className="mt-1 text-sm leading-6 text-slate-700">
                    {item.note}
                  </div>
                </div>

                <div className="rounded-2xl bg-rose-50 p-4">
                  <div className="text-xs text-rose-500">次回提案</div>
                  <div className="mt-1 text-sm font-bold leading-6 text-rose-700">
                    {item.nextSuggestion}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {navItems.map((item) => {
            const isActive = item.key === "history";

            if (item.href) {
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                    isActive
                      ? "bg-rose-50 text-rose-500"
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