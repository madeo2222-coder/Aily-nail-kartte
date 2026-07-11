"use client";

import Link from "next/link";

type OwnerMenuItem = {
  title: string;
  description: string;
  href: string;
  icon: string;
  badge: string;
};

type OwnerMenuSection = {
  title: string;
  description: string;
  items: OwnerMenuItem[];
};

const mainCards: OwnerMenuItem[] = [
  {
    title: "売上ダッシュボード",
    description:
      "売上推移、来店数、客単価など、店舗の営業状況を確認します。",
    href: "/sales-dashboard",
    icon: "📈",
    badge: "売上",
  },
  {
    title: "収支確認",
    description:
      "売上・経費・利益の状況と、月ごとの推移を確認します。",
    href: "/finance",
    icon: "📊",
    badge: "利益",
  },
  {
    title: "経費管理",
    description:
      "経費の登録、領収書、支払内容などを確認・管理します。",
    href: "/expenses",
    icon: "🧾",
    badge: "経費",
  },
  {
    title: "税理士提出",
    description:
      "月次締め、提出書類、税理士共有用の内容を確認します。",
    href: "/tax",
    icon: "📮",
    badge: "税理士",
  },
];

const menuSections: OwnerMenuSection[] = [
  {
    title: "月次・会計管理",
    description:
      "毎月の締め作業、入金、未収金、税理士提出に関するページです。",
    items: [
      {
        title: "月次締め",
        description:
          "月ごとの売上・経費・入金状況を確認し、締め作業を行います。",
        href: "/monthly-closing",
        icon: "🗓️",
        badge: "月次",
      },
      {
        title: "入金管理",
        description:
          "売上に対する入金状況や支払い方法を確認します。",
        href: "/sales-payments",
        icon: "💳",
        badge: "入金",
      },
      {
        title: "未入金一覧",
        description:
          "支払いが完了していない売上を一覧で確認します。",
        href: "/sales-payments/unpaid",
        icon: "⚠️",
        badge: "未入金",
      },
      {
        title: "未収金管理",
        description:
          "回収前の売上や未収金の状況を確認します。",
        href: "/receivables",
        icon: "💰",
        badge: "未収",
      },
      {
        title: "入金リマインド",
        description:
          "未入金案件や督促が必要な対象を確認します。",
        href: "/reminders",
        icon: "🔔",
        badge: "督促",
      },
      {
        title: "売上登録",
        description:
          "施術売上や商品売上の登録・確認を行います。",
        href: "/sales",
        icon: "🧮",
        badge: "売上登録",
      },
    ],
  },
  {
    title: "分析・レポート",
    description:
      "売上、顧客、再来率など、経営判断に必要な数字を確認します。",
    items: [
      {
        title: "月次レポート",
        description:
          "月ごとの売上、来店数、予約状況を確認します。",
        href: "/reports/monthly",
        icon: "📅",
        badge: "月次",
      },
      {
        title: "KPIレポート",
        description:
          "再来率、客単価、来店数などの主要指標を確認します。",
        href: "/reports/kpi",
        icon: "🎯",
        badge: "KPI",
      },
      {
        title: "日次レポート",
        description:
          "日ごとの売上、予約、来店状況を確認します。",
        href: "/reports/daily",
        icon: "📆",
        badge: "日次",
      },
      {
        title: "顧客レポート",
        description:
          "顧客別の来店状況や利用傾向を確認します。",
        href: "/reports/customers",
        icon: "👥",
        badge: "顧客",
      },
      {
        title: "分析ページ",
        description:
          "店舗全体の売上や顧客データを分析します。",
        href: "/analytics",
        icon: "🔎",
        badge: "分析",
      },
      {
        title: "失客分析",
        description:
          "長期間来店がない顧客や、失客傾向を確認します。",
        href: "/analytics/lost-customers",
        icon: "📉",
        badge: "失客",
      },
    ],
  },
  {
    title: "店舗・スタッフ設定",
    description:
      "店舗情報、口コミURL、スタッフ情報、各種管理設定を変更します。",
    items: [
      {
        title: "店舗設定",
        description:
          "店舗名、Google口コミ、Instagram、HPB、ミニモ、LINEのURLを設定します。",
        href: "/settings/salon",
        icon: "🏪",
        badge: "店舗",
      },
      {
        title: "スタッフ管理",
        description:
          "スタッフ情報の追加、確認、削除を行います。",
        href: "/staff/manage",
        icon: "👩‍💼",
        badge: "スタッフ",
      },
      {
        title: "管理・便利ツール",
        description:
          "予約同期、顧客統合、外部連携などの管理機能を確認します。",
        href: "/staff-tools",
        icon: "🧰",
        badge: "管理",
      },
      {
        title: "予約カレンダー",
        description:
          "現場の予約状況やスタッフ別の稼働状況を確認します。",
        href: "/reservations/calendar",
        icon: "📅",
        badge: "予約",
      },
    ],
  },
];

export default function OwnerDashboardPage() {
  async function handleStaffLogout() {
    try {
      await fetch("/api/staff-login/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-24 sm:p-6">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-800 to-stone-700 p-5 text-white shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.22em] text-white/70">
                NAILY AIDOL
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
                  オーナー経営ボード
                </h1>

                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white">
                  OWNER
                </span>
              </div>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-200">
                売上・経費・利益・月次締め・KPI・税理士提出・店舗設定など、
                オーナー向けの経営機能をまとめた専用ページです。
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 lg:w-auto lg:min-w-[340px]">
              <Link
                href="/dashboard"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-3 py-3 text-center text-sm font-bold text-slate-900 shadow"
              >
                スタッフホーム
              </Link>

              <button
                type="button"
                onClick={handleStaffLogout}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/30 bg-white/10 px-3 py-3 text-center text-sm font-bold text-white backdrop-blur"
              >
                ログアウト
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-slate-900">
              経営状況を確認
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              オーナーが日常的に確認する主要メニューです。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mainCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-stone-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-3xl" aria-hidden="true">
                    {card.icon}
                  </div>

                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {card.badge}
                  </span>
                </div>

                <h3 className="mt-4 text-lg font-bold text-slate-900">
                  {card.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {card.description}
                </p>

                <div className="mt-4 flex items-center justify-between text-sm font-bold text-slate-700">
                  <span>開く</span>
                  <span className="transition group-hover:translate-x-1">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {menuSections.map((section) => (
          <section
            key={section.title}
            className="rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="mb-4">
              <h2 className="text-xl font-bold text-slate-900">
                {section.title}
              </h2>

              <p className="mt-1 text-sm leading-6 text-slate-500">
                {section.description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-[24px] border border-stone-200 bg-stone-50/70 p-4 transition hover:-translate-y-0.5 hover:bg-stone-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-2xl" aria-hidden="true">
                      {item.icon}
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-bold text-slate-900">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>

                  <div className="mt-4 flex items-center justify-between text-sm font-bold text-slate-700">
                    <span>開く</span>
                    <span className="transition group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-base font-bold text-amber-900">
            スタッフ画面との使い分け
          </h2>

          <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
            <p>
              ・スタッフは予約・顧客・来店登録を中心に
              「スタッフホーム」を使います。
            </p>

            <p>
              ・売上・経費・収支・月次締め・分析・税理士提出は、
              このオーナー経営ボードから確認します。
            </p>

            <p>
              ・店舗設定やスタッフ管理など、権限が必要な作業も
              オーナー画面から行います。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}