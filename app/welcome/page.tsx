"use client";

import Link from "next/link";

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-8 sm:px-6">
        <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="text-center">
            <p className="text-xs font-semibold tracking-[0.25em] text-orange-500">
              AILY NAIL STUDIO
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
              ご来店ありがとうございます
            </h1>
            <p className="mt-4 text-sm leading-7 text-gray-600">
              初めてご来店のお客様は、
              施術を安全に行うため事前入力をお願いします。
            </p>
          </div>

          <div className="mt-8 rounded-3xl bg-orange-50 p-5 ring-1 ring-orange-100">
            <h2 className="text-base font-bold text-orange-900">
              初回来店のお客様へ
            </h2>
            <div className="mt-3 space-y-2 text-sm leading-7 text-orange-800">
              <p>・お名前、電話番号の入力</p>
              <p>・アレルギー、施術NG項目の確認</p>
              <p>・注意事項の確認チェック</p>
              <p>・ご署名</p>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href="/customer-intake"
              className="flex w-full items-center justify-center rounded-3xl bg-orange-500 px-5 py-4 text-base font-bold text-white transition hover:bg-orange-600"
            >
              初回入力をはじめる
            </Link>
          </div>

          <div className="mt-4 rounded-3xl bg-gray-50 p-5">
            <h2 className="text-base font-bold text-gray-900">
              入力時間の目安
            </h2>
            <p className="mt-2 text-sm leading-7 text-gray-600">
              約1〜2分で完了します。
              スマホの画面上でそのまま署名できます。
            </p>
          </div>

          <div className="mt-4 rounded-3xl bg-gray-50 p-5">
            <h2 className="text-base font-bold text-gray-900">
              ご安心ください
            </h2>
            <div className="mt-2 space-y-2 text-sm leading-7 text-gray-600">
              <p>・このページは初回受付専用です</p>
              <p>・顧客一覧や管理画面は表示されません</p>
              <p>・入力内容はスタッフ確認用として管理されます</p>
            </div>
          </div>

          <div className="mt-6 border-t border-gray-100 pt-5 text-center">
            <p className="text-sm font-medium text-gray-700">
              Aily Nail Studio
            </p>
            <p className="mt-1 text-xs leading-6 text-gray-500">
              ご不明点がある場合はスタッフまでお声がけください。
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}