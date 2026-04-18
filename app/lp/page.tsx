"use client";

import Link from "next/link";

const painPoints = [
  "売上管理がバラバラで、月末にまとめて確認している",
  "経費を後回しにしてしまい、月初に慌てる",
  "領収書やレシート整理が大変",
  "税理士に渡す資料作りが毎月面倒",
  "経理担当を置くほどではないけど、数字はちゃんと見たい",
  "再来店につながる導線が弱い",
  "口コミをもっと増やしたい",
];

const storeFeatures = [
  "顧客管理",
  "来店履歴管理",
  "売上登録",
  "支払い方法 / 複数支払い内訳の管理",
  "経費登録",
  "月次PDF出力",
  "月次総合CSV出力",
  "売上明細CSV出力",
  "経費明細CSV出力",
  "税理士提出前チェック",
  "スタッフ別売上の確認",
  "支払い方法別集計",
];

const customerFeatures = [
  "次回予約導線",
  "来店履歴確認",
  "次回来店提案",
  "口コミ投稿導線",
  "お知らせ / キャンペーン表示",
  "サロンとの接点維持",
];

const steps = [
  "ダッシュボードで対象月を確認",
  "月次PDFを生成",
  "月次総合CSVを出力",
  "来店一覧で売上明細CSVを出力",
  "経費一覧で経費明細CSVを出力",
  "税理士提出ページでチェック",
  "領収書 / 通帳明細などをまとめて送付",
];

const plans = [
  {
    name: "ライト",
    initial: "33,000円",
    monthly: "11,000円",
    target: "1人サロン / まずは売上と経費をまとめたい方向け",
  },
  {
    name: "スタンダード",
    initial: "55,000円",
    monthly: "22,000円",
    target: "小規模サロン / 月次管理も重視したい方向け",
  },
  {
    name: "プレミアム",
    initial: "110,000円",
    monthly: "33,000円",
    target: "導入支援を厚めに受けたい方向け",
  },
];

const screenCards = [
  {
    title: "ダッシュボード",
    body: "売上・経費・粗利・月次推移をひと目で確認。経営数字を感覚ではなく数字で見られます。",
    badge: "店側",
  },
  {
    title: "税理士提出ページ",
    body: "月次資料の準備状況を確認しながら、税理士提出前のチェックや文面作成ができます。",
    badge: "月初業務",
  },
  {
    title: "お客様向けアプリ",
    body: "次回予約、来店履歴、次回来店提案、口コミ導線、お知らせ表示まで。再来店につながる仕組みをつくれます。",
    badge: "再来導線",
  },
];

export default function LpPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-rose-600 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide">
                Naily AiDOL
              </div>

              <h1 className="mt-5 text-4xl font-bold leading-tight md:text-6xl">
                1人サロン・小規模サロンのための
                <br />
                経営管理 × 再来店導線アプリ
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-white/90 md:text-lg">
                売上管理、経費管理、月次確認、税理士提出準備。
                さらに、お客様向けアプリで
                <span className="font-bold text-white">
                  {" "}
                  予約・来店履歴・口コミ導線・再来店導線
                </span>
                までまとめて管理。
              </p>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/80 md:text-base">
                Naily AiDOL は、ネイルサロンの毎日の管理と月初業務、そしてお客様との接点づくりまで支える経営管理アプリです。
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#contact"
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-rose-600 shadow-lg"
                >
                  無料デモを申し込む
                </a>
                <a
                  href="#screens"
                  className="rounded-2xl border border-white/30 px-5 py-3 text-sm font-bold text-white"
                >
                  画面を見てみる
                </a>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-3xl bg-white p-5 text-slate-900 shadow-xl">
                <div className="text-sm text-slate-500">店側アプリ</div>
                <div className="mt-2 text-2xl font-bold">売上 / 経費 / 粗利</div>
                <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                  ダッシュボードで月次数字をひと目で把握。PDF / CSV 出力まで対応。
                </div>
              </div>

              <div className="rounded-3xl bg-white p-5 text-slate-900 shadow-xl">
                <div className="text-sm text-slate-500">お客様向けアプリ</div>
                <div className="mt-2 text-2xl font-bold">予約 / 履歴 / 口コミ</div>
                <div className="mt-3 rounded-2xl bg-rose-50 p-4 text-sm leading-7 text-slate-600">
                  次回予約導線、来店履歴、次回来店提案、口コミ導線までつくれます。
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <div className="max-w-3xl">
          <div className="text-sm font-bold tracking-wide text-rose-500">
            PROBLEMS
          </div>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">
            こんなお悩みありませんか？
          </h2>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {painPoints.map((item) => (
            <div key={item} className="rounded-3xl border bg-slate-50 p-5">
              <div className="text-base font-medium leading-7 text-slate-700">
                {item}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold tracking-wide text-rose-500">
              FEATURES
            </div>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">
              Naily AiDOLでできること
            </h2>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                店側アプリ
              </div>
              <div className="mt-4 grid gap-3">
                {storeFeatures.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600">
                お客様向けアプリ
              </div>
              <div className="mt-4 grid gap-3">
                {customerFeatures.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border bg-rose-50 px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-sm font-bold tracking-wide text-rose-500">
              BENEFIT
            </div>
            <h2 className="mt-3 text-3xl font-bold">
              管理するだけで終わらない。
              <br />
              再来店につながる。
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              店側では売上・経費・粗利・月次資料・税理士提出準備を整理。
              お客様側では次回予約導線、来店履歴、次回来店提案、口コミ投稿導線までつくれます。
            </p>
          </div>

          <div className="rounded-3xl border bg-slate-900 p-6 text-white shadow-sm">
            <div className="text-sm font-bold tracking-wide text-rose-300">
              FIT
            </div>
            <h2 className="mt-3 text-3xl font-bold">
              1人サロンでも、
              <br />
              小規模サロンでも使いやすい
            </h2>
            <p className="mt-5 text-base leading-8 text-white/85">
              まずは、売上を入れる、経費を入れる、月初に資料を出す。
              ここから始められます。最初から難しい運用は必要ありません。
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold tracking-wide text-rose-500">
              MONTHLY FLOW
            </div>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">
              月初業務がラクになる
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step} className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="text-xs font-bold tracking-wide text-slate-400">
                  STEP {index + 1}
                </div>
                <div className="mt-3 text-base font-bold leading-7 text-slate-800">
                  {step}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="screens" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <div className="max-w-3xl">
          <div className="text-sm font-bold tracking-wide text-rose-500">
            SCREENS
          </div>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">
            画面イメージ
          </h2>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {screenCards.map((card) => (
            <div key={card.title} className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {card.badge}
              </div>
              <div className="mt-4 text-2xl font-bold">{card.title}</div>
              <p className="mt-4 text-sm leading-7 text-slate-600">{card.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Link
            href="/dashboard"
            className="rounded-2xl border bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700"
          >
            ダッシュボードを見る
          </Link>
          <Link
            href="/tax"
            className="rounded-2xl border bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700"
          >
            税理士ページを見る
          </Link>
          <Link
            href="/customer-app"
            className="rounded-2xl border bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700"
          >
            顧客アプリを見る
          </Link>
        </div>
      </section>

      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold tracking-wide text-rose-300">
              PRICING
            </div>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">
              料金プラン
            </h2>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className="rounded-3xl bg-white p-6 text-slate-900 shadow-sm"
              >
                <div className="text-2xl font-bold">{plan.name}</div>
                <div className="mt-4 text-sm text-slate-500">初期費用</div>
                <div className="mt-1 text-3xl font-bold">{plan.initial}</div>
                <div className="mt-4 text-sm text-slate-500">月額</div>
                <div className="mt-1 text-3xl font-bold">{plan.monthly}</div>
                <p className="mt-5 text-sm leading-7 text-slate-600">
                  {plan.target}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border bg-slate-50 p-6">
            <div className="text-sm font-bold tracking-wide text-rose-500">
              SUPPORT
            </div>
            <h2 className="mt-3 text-3xl font-bold">
              導入支援付きで始められます
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              Naily AiDOL は、ただアプリを渡して終わりではありません。
              初期設定、基本操作説明、月初ルーティン説明まで含めて導入できます。
            </p>
          </div>

          <div
            id="contact"
            className="rounded-3xl border bg-white p-6 shadow-sm"
          >
            <div className="text-sm font-bold tracking-wide text-rose-500">
              CTA
            </div>
            <h2 className="mt-3 text-3xl font-bold">
              まずは無料デモから
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              売上管理、経費管理、月次確認、税理士提出準備、
              さらにお客様向けアプリによる再来導線まで。
              まずは画面を見ながらご説明します。
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="rounded-2xl bg-rose-500 px-5 py-3 text-sm font-bold text-white"
              >
                無料デモを申し込む
              </button>
              <button
                type="button"
                className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700"
              >
                導入相談をする
              </button>
            </div>

            <div className="mt-4 text-xs leading-6 text-slate-500">
              ※ ここは次段階でフォームやLINE導線に接続できます
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}