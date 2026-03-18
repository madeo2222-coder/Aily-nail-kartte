"use client";

import Link from "next/link";

export default function WelcomeCardPage() {
  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/welcome"
            className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          >
            お客様案内ページへ
          </Link>
          <Link
            href="/customer-intake"
            className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          >
            入力ページへ
          </Link>
          <Link
            href="/staff"
            className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            スタッフ入口へ
          </Link>
        </div>

        <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-10">
          <div className="text-center">
            <p className="text-xs font-semibold tracking-[0.28em] text-orange-500">
              AILY NAIL STUDIO
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              初めてご来店のお客様へ
            </h1>
            <p className="mt-4 text-sm leading-7 text-gray-600 sm:text-base">
              施術を安全に行うため、
              ご来店前またはご来店時に
              初回受付フォームの入力をお願いします。
            </p>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl bg-orange-50 p-6 ring-1 ring-orange-100">
              <h2 className="text-lg font-bold text-orange-900">
                入力していただく内容
              </h2>

              <div className="mt-4 space-y-3 text-sm leading-7 text-orange-800">
                <p>・お名前</p>
                <p>・電話番号</p>
                <p>・アレルギーや皮膚トラブルの有無</p>
                <p>・施術で避けてほしいこと</p>
                <p>・注意事項の確認</p>
                <p>・スマホ画面でのご署名</p>
              </div>

              <div className="mt-6 rounded-2xl bg-white/80 p-4">
                <p className="text-sm font-bold text-gray-900">所要時間の目安</p>
                <p className="mt-2 text-sm leading-6 text-gray-700">
                  約1〜2分で完了します。
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-300 bg-gray-50 p-6">
              <div className="flex h-64 w-64 items-center justify-center rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="px-6 text-center">
                  <p className="text-sm font-bold text-gray-900">QRコード掲載エリア</p>
                  <p className="mt-3 text-xs leading-6 text-gray-500">
                    ここに
                    <span className="font-bold text-gray-700"> /welcome </span>
                    のQRを配置してください
                  </p>
                </div>
              </div>

              <p className="mt-4 text-center text-xs leading-6 text-gray-500">
                印刷用・掲示用の見本ページです
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl bg-gray-50 p-6">
            <h2 className="text-lg font-bold text-gray-900">ご案内文（掲示用）</h2>
            <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
              <p className="text-base font-bold text-gray-900">
                初めてご来店のお客様は、こちらからご入力をお願いいたします。
              </p>
              <p className="mt-3 text-sm leading-7 text-gray-700">
                安全に施術を行うため、アレルギーや注意事項の確認、
                ご署名をお願いしております。
                スマートフォンで簡単にご入力いただけます。
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-gray-50 p-5">
              <p className="text-sm font-bold text-gray-900">導線URL</p>
              <p className="mt-2 break-all text-sm leading-6 text-gray-600">
                /welcome
              </p>
            </div>

            <div className="rounded-3xl bg-gray-50 p-5">
              <p className="text-sm font-bold text-gray-900">入力本体URL</p>
              <p className="mt-2 break-all text-sm leading-6 text-gray-600">
                /customer-intake
              </p>
            </div>

            <div className="rounded-3xl bg-gray-50 p-5">
              <p className="text-sm font-bold text-gray-900">スタッフURL</p>
              <p className="mt-2 break-all text-sm leading-6 text-gray-600">
                /staff
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <h2 className="text-base font-bold text-amber-900">
              店舗運用メモ
            </h2>
            <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
              <p>① このページを開いてデザイン確認</p>
              <p>② /welcome のQRコードを別途作成して中央に配置</p>
              <p>③ 店内POP・受付・席案内に掲示</p>
              <p>④ InstagramプロフィールやLINE案内にも /welcome を使用</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}