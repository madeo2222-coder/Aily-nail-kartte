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
    title: "顧客ページ",
    description:
      "顧客情報の確認・編集・削除など、通常の顧客管理に移動します。",
    href: "/customers",
    badge: "管理",
  },
  {
    title: "来店ページ",
    description:
      "来店履歴の確認や、日々の運用確認に使います。",
    href: "/visits",
    badge: "現場運用",
  },
  {
    title: "来店登録ページ",
    description:
      "施術後または来店時の登録導線です。通常運用の入口として使えます。",
    href: "/visits/new",
    badge: "入力",
  },
];

export default function StaffToolsPage() {
  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-10">
        <section className="mb-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            NAILY AIDOL
          </p>
          <h1 className="mt-2 text-2xl font-bold">スタッフ用ショートカット</h1>
          <p className="mt-2 text-sm leading-6 text-white/90">
            お店でよく使うページをまとめた、スタッフさん向けの便利ページです。
            ブックマークしておくと、受付・施術前確認・顧客確認がスムーズになります。
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-50/50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                  {tool.badge}
                </span>
                <span className="text-sm text-slate-400 transition group-hover:text-rose-500">
                  →
                </span>
              </div>

              <h2 className="mt-4 text-lg font-bold text-slate-900">
                {tool.title}
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {tool.description}
              </p>

              <div className="mt-5 inline-flex rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition group-hover:bg-white">
                開く
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-6 rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-slate-900">
            スタッフさん向けおすすめ導線
          </h3>
          <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <p>① 来店前に「初回情報クイック確認」でアレルギーやNG項目を確認</p>
            <p>② 必要なら「初回来店入力一覧」で署名や詳細を再確認</p>
            <p>③ 施術後は「来店登録ページ」へ進んで記録</p>
          </div>
        </section>
      </div>
    </main>
  );
}