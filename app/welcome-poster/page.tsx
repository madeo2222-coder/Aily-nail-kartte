"use client";

import Link from "next/link";

export default function WelcomePosterPage() {
  return (
    <main className="min-h-screen bg-neutral-200 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-2 print:hidden">
          <Link
            href="/welcome-card"
            className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          >
            掲示カードへ
          </Link>
          <Link
            href="/welcome"
            className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          >
            お客様案内へ
          </Link>
          <Link
            href="/staff"
            className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            スタッフ入口へ
          </Link>
        </div>

        <div className="mx-auto w-full max-w-[840px] rounded-[36px] bg-white p-6 shadow-lg ring-1 ring-black/5 sm:p-10">
          <div className="rounded-[28px] bg-gradient-to-b from-orange-50 to-white p-6 sm:p-8">
            <div className="text-center">
              <p className="text-xs font-semibold tracking-[0.35em] text-orange-500">
                AILY NAIL STUDIO
              </p>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                初めてご来店の
                <br />
                お客様へ
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-gray-600 sm:text-base">
                施術を安全に行うため、
                初回受付フォームのご入力をお願いしております。
                下のQRコードからスマートフォンでご入力ください。
              </p>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-[1fr_320px] md:items-center">
              <div className="space-y-4">
                <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
                  <h2 className="text-lg font-bold text-gray-900">
                    ご入力内容
                  </h2>
                  <div className="mt-4 grid gap-3 text-sm leading-7 text-gray-700">
                    <p>・お名前</p>
                    <p>・電話番号</p>
                    <p>・アレルギー / 皮膚トラブル</p>
                    <p>・施術で避けてほしいこと</p>
                    <p>・注意事項の確認</p>
                    <p>・スマホ画面でのご署名</p>
                  </div>
                </div>

                <div className="rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
                  <h2 className="text-base font-bold text-amber-900">
                    所要時間の目安
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-amber-800">
                    約1〜2分で完了します。
                    ご不明点はスタッフまでお気軽にお声がけください。
                  </p>
                </div>
              </div>

              <div className="rounded-[32px] border-2 border-dashed border-gray-300 bg-white p-6 text-center shadow-sm">
                <div className="mx-auto flex h-[260px] w-[260px] items-center justify-center rounded-[28px] bg-gray-50 ring-1 ring-black/5">
                  <div className="px-4">
                    <p className="text-base font-bold text-gray-900">
                      QRコード
                    </p>
                    <p className="mt-3 text-xs leading-6 text-gray-500">
                      ここに
                      <span className="font-bold text-gray-700"> /welcome </span>
                      のQRコードを配置
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm font-medium text-gray-700">
                  スマホで読み取ってください
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h2 className="text-lg font-bold text-gray-900">
                掲示用ご案内文
              </h2>
              <div className="mt-4 rounded-2xl bg-gray-50 p-5">
                <p className="text-lg font-bold text-gray-900">
                  初めてご来店のお客様は、
                  こちらからご入力をお願いいたします。
                </p>
                <p className="mt-3 text-sm leading-7 text-gray-700">
                  安全に施術を行うため、アレルギーや注意事項の確認、
                  ご署名をお願いしております。
                  スマートフォンで簡単にご入力いただけます。
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                <p className="text-sm font-bold text-gray-900">お客様入口</p>
                <p className="mt-2 text-sm text-gray-600">/welcome</p>
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                <p className="text-sm font-bold text-gray-900">入力本体</p>
                <p className="mt-2 text-sm text-gray-600">/customer-intake</p>
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                <p className="text-sm font-bold text-gray-900">スタッフ入口</p>
                <p className="mt-2 text-sm text-gray-600">/staff</p>
              </div>
            </div>

            <div className="mt-8 rounded-3xl bg-orange-500 px-6 py-5 text-center text-white">
              <p className="text-lg font-bold">
                ご協力ありがとうございます
              </p>
              <p className="mt-2 text-sm leading-7 text-orange-50">
                入力完了後は、そのままスタッフへお声がけください。
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}