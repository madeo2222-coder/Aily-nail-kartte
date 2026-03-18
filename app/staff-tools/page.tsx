"use client";

import Link from "next/link";

const tools = [
  {
    title: "初回情報クイック確認",
    description:
      "来店前や施術前に、名前・電話番号で初回入力情報をすぐ検索して確認できます。",
    href: "/intake-lookup",
    badge: "最優先",
  },
  {
    title: "初回来店入力一覧",
    description:
      "お客様スマホから送信された初回受付情報を一覧で確認できます。未連携データの確認にも使います。",
    href: "/customer-intake/list",
    badge: "受付確認",
  },
  {
    title: "お客様入力ページ",
    description:
      "お客様本人がスマホで入力するページです。店内QRやInstagram導線から案内できます。",
    href: "/customer-intake",
    badge: "お客様用",
  },
  {
    title: "顧客一覧",
    description:
      "顧客情報の確認・編集・削除など、通常の顧客管理に移動します。",
    href: "/customers",
    badge: "管理",
  },
  {
    title: "来店一覧",
    description:
      "来店履歴の確認や、日々の運用確認に使います。",
    href: "/visits",
    badge: "現場運用",
  },
  {
    title: "来店登録",
    description:
      "施術後または来店時の登録導線です。通常運用の入口として使えます。",
    href: "/visits/new",
    badge: "入力",
  },
];

export default function StaffToolsPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <p className="text-xs font-semibold tracking-[0.2em] text-orange-500">
            NAILY AIDOL
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            スタッフ用ショートカット
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            現場でよく使う導線をまとめたページです。
            ブックマークしておくと、受付・施術前確認・顧客確認が早くなります。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:ring-orange-300"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                  {tool.badge}
                </span>
                <span className="text-sm text-gray-400 transition group-hover:text-orange-500">
                  →
                </span>
              </div>

              <h2 className="mt-4 text-lg font-bold text-gray-900">
                {tool.title}
              </h2>

              <p className="mt-3 text-sm leading-6 text-gray-600">
                {tool.description}
              </p>

              <div className="mt-5 inline-flex rounded-2xl bg-gray-50 px-4 py-2 text-sm font-bold text-gray-700 transition group-hover:bg-orange-50 group-hover:text-orange-700">
                開く
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <h3 className="text-base font-bold text-amber-900">
            現場おすすめ運用
          </h3>
          <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
            <p>① 来店前に「初回情報クイック確認」でアレルギー・NG項目を確認</p>
            <p>② 必要なら「初回来店入力一覧」で署名や詳細を再確認</p>
            <p>③ 施術後に通常の来店登録へ進む</p>
          </div>
        </div>
      </div>
    </main>
  );
}