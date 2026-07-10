"use client";

import Link from "next/link";

const primaryLinks = [
  {
    title: "予約カレンダー",
    description:
      "スタッフ別・時間帯別の予約を確認し、HPB・ミニモの予約を今すぐ同期できます。",
    href: "/reservations/calendar",
  },
  {
    title: "予約一覧",
    description:
      "予約内容の確認・確定・変更・キャンセル管理を行います。",
    href: "/reservations",
  },
  {
    title: "初回情報クイック確認",
    description:
      "名前・電話番号で初回入力内容やアレルギー情報をすぐ確認します。",
    href: "/intake-lookup",
  },
  {
    title: "来店登録",
    description:
      "施術内容・次回提案・写真など、来店情報を登録します。",
    href: "/visits/new",
  },
];

const secondaryLinks = [
  {
    title: "管理・便利ツール",
    description:
      "予約同期、顧客統合、店舗設定、売上、分析、レポートなどの管理ページをまとめて開きます。",
    href: "/staff-tools",
  },
  {
    title: "初回来店入力一覧",
    description:
      "お客様がスマホから入力した初回受付情報を一覧で確認します。",
    href: "/customer-intake/list",
  },
  {
    title: "顧客一覧",
    description:
      "顧客情報・来店履歴・写真・次回提案などを確認します。",
    href: "/customers",
  },
  {
    title: "来店一覧",
    description:
      "登録済みの来店履歴や施術記録を確認します。",
    href: "/visits",
  },
  {
    title: "スタッフ管理",
    description:
      "スタッフ名の追加・確認・削除を行います。",
    href: "/staff/manage",
  },
  {
    title: "お客様入力ページ",
    description:
      "初回来店のお客様がスマホから情報を入力するページです。",
    href: "/customer-intake",
  },
];

export default function StaffEntryPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-10">
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <p className="text-xs font-semibold tracking-[0.2em] text-orange-500">
            NAILY AIDOL
          </p>

          <h1 className="mt-2 text-3xl font-bold text-gray-900">
            スタッフ入口
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-600">
            受付・予約確認・施術前確認・来店登録など、日常業務でよく使う機能にすぐ入れます。
            その他の設定や管理機能は「管理・便利ツール」にまとめています。
          </p>
        </section>

        <section className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">最優先導線</h2>

            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
              よく使う
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            その他メニュー
          </h2>

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
          <h2 className="text-base font-bold text-amber-900">
            おすすめ運用
          </h2>

          <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
            <p>① スタッフは最初にこの「スタッフ入口」を開く</p>
            <p>② 当日の予約は「予約カレンダー」で確認する</p>
            <p>
              ③ HPB・ミニモの新しい予約がある場合は「予約今すぐ同期」を押す
            </p>
            <p>
              ④ 施術前は「初回情報クイック確認」でアレルギーや注意事項を確認する
            </p>
            <p>⑤ 施術後は「来店登録」から施術記録と写真を登録する</p>
            <p>
              ⑥ 顧客統合・店舗設定・分析などは「管理・便利ツール」から開く
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}