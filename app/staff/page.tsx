"use client";

import Link from "next/link";

const primaryLinks = [
  {
    title: "初回情報クイック確認",
    description: "名前・電話番号で初回入力内容をすぐ確認",
    href: "/intake-lookup",
  },
  {
    title: "初回来店入力一覧",
    description: "お客様が入力した初回情報を一覧で確認",
    href: "/customer-intake/list",
  },
  {
    title: "来店登録",
    description: "通常の来店登録へ進む",
    href: "/visits/new",
  },
];

const secondaryLinks = [
  {
    title: "スタッフ用ショートカット",
    description: "現場用の各種導線をまとめて開く",
    href: "/staff-tools",
  },
  {
    title: "顧客一覧",
    description: "顧客確認・編集・削除",
    href: "/customers",
  },
  {
    title: "来店一覧",
    description: "来店履歴の確認",
    href: "/visits",
  },
  {
    title: "お客様入力ページ",
    description: "お客様スマホ用の入力ページ",
    href: "/customer-intake",
  },
];

export default function StaffEntryPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <p className="text-xs font-semibold tracking-[0.2em] text-orange-500">
            NAILY AIDOL
          </p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">
            スタッフ入口
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            受付・施術前確認・来店登録でよく使う機能に、ここからすぐ入れます。
            スタッフさんにはこのページをホーム画面追加またはブックマークしてもらう運用がおすすめです。
          </p>
        </div>

        <section className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">最優先導線</h2>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
              よく使う
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {primaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:ring-orange-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                    重要
                  </span>
                  <span className="text-sm text-gray-400 transition group-hover:text-orange-500">
                    →
                  </span>
                </div>

                <h3 className="mt-4 text-lg font-bold text-gray-900">
                  {item.title}
                </h3>

                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {item.description}
                </p>

                <div className="mt-5 rounded-2xl bg-orange-500 px-4 py-3 text-center text-sm font-bold text-white transition group-hover:bg-orange-600">
                  開く
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-bold text-gray-900">その他メニュー</h2>

          <div className="grid gap-4 md:grid-cols-2">
            {secondaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:ring-orange-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      {item.description}
                    </p>
                  </div>
                  <span className="text-sm text-gray-400 transition group-hover:text-orange-500">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <h2 className="text-base font-bold text-amber-900">おすすめ運用</h2>

          <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
            <p>① スタッフはまず /staff を開く</p>
            <p>② 施術前は「初回情報クイック確認」でアレルギーやNG項目を確認</p>
            <p>③ 詳細が必要なら「初回来店入力一覧」や顧客別の初回情報ページを見る</p>
            <p>④ 施術後は「来店登録」へ進む</p>
          </div>
        </section>
      </div>
    </main>
  );
}