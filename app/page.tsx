"use client"

import Link from "next/link"

const primaryLinks = [
  {
    href: "/dashboard",
    title: "ダッシュボード",
    description: "売上・入金・未入金・利益の全体確認",
  },
  {
    href: "/customers/intake",
    title: "顧客登録",
    description: "初回来店のお客様登録ページ",
  },
  {
    href: "/visits/new",
    title: "来店登録",
    description: "施術・写真・売上を登録",
  },
]

const managementLinks = [
  {
    href: "/customers",
    title: "顧客一覧",
    description: "顧客詳細・マイページ案内",
  },
  {
    href: "/reservations",
    title: "予約一覧",
    description: "予約確認・来店導線",
  },
  {
    href: "/visits",
    title: "来店一覧",
    description: "来店履歴確認・編集・入金登録",
  },
  {
    href: "/sales-payments",
    title: "入金管理",
    description: "入金一覧・支払方法別集計",
  },
  {
    href: "/expenses",
    title: "経費管理",
    description: "経費登録・領収書管理",
  },
  {
    href: "/monthly-closing",
    title: "月次締め",
    description: "売上・入金・経費の月次集計",
  },
  {
    href: "/reports/monthly",
    title: "月次レポート",
    description: "税務・経営確認用の月次まとめ",
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <div className="rounded-3xl bg-black px-6 py-8 text-white shadow-sm">
          <div className="space-y-3">
            <p className="text-sm text-white/70">Naily AiDOL</p>
            <h1 className="text-3xl font-bold">Aily Nail Studio 現場ポータル</h1>
            <p className="max-w-3xl text-sm text-white/80 sm:text-base">
              顧客・予約・来店・入金・経費・月次までを一気通貫で管理する
              ネイルサロン向け経営SaaSの入口です。
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">最優先導線</h2>
            <p className="text-sm text-gray-500">
              営業中によく使う導線を先頭にまとめています
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {primaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl bg-white p-5 shadow-sm border transition hover:-translate-y-0.5"
              >
                <div className="space-y-2">
                  <div className="text-lg font-semibold">{item.title}</div>
                  <div className="text-sm text-gray-500">{item.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">管理メニュー</h2>
            <p className="text-sm text-gray-500">
              現場運用と経営管理に必要な画面一覧です
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {managementLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border bg-white p-5 shadow-sm transition hover:bg-gray-50"
              >
                <div className="space-y-2">
                  <div className="text-lg font-semibold">{item.title}</div>
                  <div className="text-sm text-gray-500">{item.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">朝の流れ</h3>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p>1. ダッシュボードで全体確認</p>
              <p>2. 予約一覧で本日の来店確認</p>
              <p>3. 来店時に顧客登録または来店登録</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">営業中の流れ</h3>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p>1. 来店登録で施術内容と売上を記録</p>
              <p>2. 必要に応じて写真を追加</p>
              <p>3. 会計後に入金登録</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">締め作業</h3>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p>1. 経費登録を確認</p>
              <p>2. 月次締めで数値確認</p>
              <p>3. 月次レポートで税務用に確認</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}