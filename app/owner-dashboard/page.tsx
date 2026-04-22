"use client";

import Link from "next/link";

const mainCards = [
  {
    title: "税理士提出",
    description: "月次締め・提出チェック・文面確認",
    href: "/tax",
    icon: "📮",
  },
  {
    title: "収支確認",
    description: "収支・利益・推移を確認",
    href: "/finance",
    icon: "📊",
  },
  {
    title: "経費管理",
    description: "経費一覧・登録・確認",
    href: "/expenses",
    icon: "🧾",
  },
  {
    title: "売上ダッシュボード",
    description: "売上推移や営業数値を見る",
    href: "/sales-dashboard",
    icon: "📈",
  },
];

const subCards = [
  {
    title: "月次レポート",
    description: "月次数字の確認",
    href: "/reports/monthly",
  },
  {
    title: "KPIレポート",
    description: "重要指標を確認",
    href: "/reports/kpi",
  },
  {
    title: "日別売上",
    description: "日次ベースで確認",
    href: "/reports/daily",
  },
  {
    title: "未収管理",
    description: "未収金の確認",
    href: "/receivables",
  },
];

export default function OwnerDashboardPage() {
  return (
    <main className="min-h-screen bg-stone-50 p-4 pb-24">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-slate-800 to-stone-700 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.22em] text-white/70">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-3xl font-bold">オーナー向け経営ボード</h1>
              <p className="mt-3 text-sm leading-7 text-stone-200">
                オーナー・経理・税理士向けの導線をまとめたページです。
                現場スタッフ用ホームとは分けて、数字確認や提出作業へすぐ進めるようにしています。
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-900"
            >
              スタッフホームへ戻る
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {mainCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:bg-stone-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-3xl">{card.icon}</div>
                  <h2 className="mt-3 text-xl font-bold text-slate-900">
                    {card.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {card.description}
                  </p>
                </div>
                <span className="text-lg text-slate-400 transition group-hover:text-slate-700">
                  →
                </span>
              </div>
            </Link>
          ))}
        </section>

        <section className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">その他の経営メニュー</h2>
          <p className="mt-1 text-sm text-slate-500">
            月次確認や補助的な確認導線をまとめています。
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {subCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="rounded-2xl bg-stone-50 p-4 transition hover:bg-stone-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-slate-900">
                      {card.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {card.description}
                    </div>
                  </div>
                  <span className="text-slate-400">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-base font-bold text-amber-900">使い分けの考え方</h2>
          <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
            <p>・スタッフは /dashboard を中心に使う</p>
            <p>・オーナー、経理、税理士導線は /owner-dashboard を使う</p>
            <p>・税理士提出や月次確認はこのページからまとめて入る</p>
          </div>
        </section>
      </div>
    </main>
  );
}