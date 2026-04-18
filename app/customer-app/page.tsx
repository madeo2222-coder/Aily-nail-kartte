"use client";

import Link from "next/link";
import { useState } from "react";

type NewsItem = {
  id: string;
  title: string;
  body: string;
  date: string;
  tag: string;
};

type MenuItem = {
  id: string;
  title: string;
  description: string;
  price: string;
};

const newsItems: NewsItem[] = [
  {
    id: "1",
    title: "新色マグネットジェル入荷しました",
    body: "春夏に人気の透明感カラーを追加しています。次回のご予約時にぜひご相談ください。",
    date: "2026/04/17",
    tag: "新着",
  },
  {
    id: "2",
    title: "GW期間の営業について",
    body: "連休中は営業時間が一部変則となります。ご希望日時はお早めにご予約ください。",
    date: "2026/04/15",
    tag: "営業案内",
  },
  {
    id: "3",
    title: "フットキャンペーン実施中",
    body: "フットネイルご利用の方に、期間限定でケアメニューをおすすめしています。",
    date: "2026/04/12",
    tag: "キャンペーン",
  },
];

const recommendedMenus: MenuItem[] = [
  {
    id: "1",
    title: "初夏デザインコース",
    description: "透明感のある季節カラーとトレンドデザインを組み合わせたおすすめメニューです。",
    price: "¥7,700〜",
  },
  {
    id: "2",
    title: "フィルインメンテナンス",
    description:
      "前回施術の持ちを活かしながら負担を抑えてきれいな状態を保ちやすい人気メニューです。",
    price: "¥6,600〜",
  },
  {
    id: "3",
    title: "フット＋角質ケア",
    description: "サンダル時期に向けて足元を整えたい方におすすめです。",
    price: "¥8,800〜",
  },
];

const navItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "news", label: "お知らせ", icon: "📢", href: "" },
  { key: "mypage", label: "マイ", icon: "👤", href: "" },
];

export default function CustomerAppPage() {
  const [message, setMessage] = useState("");

  const customerName = "山田 花子";
  const salonName = "Aily Nail Studio";
  const nextVisitWindow = "5月上旬〜中旬";
  const lastVisitDate = "2026/04/10";
  const lastMenu = "ワンカラー + フィルイン";
  const lastStaff = "山田";
  const nextReservedAt = "";

  const heroStatusText = nextReservedAt
    ? `次回予約：${nextReservedAt}`
    : "そろそろご来店のおすすめ時期です";

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            CUSTOMER APP PREVIEW
          </div>
          <div className="mt-2 text-sm opacity-90">{salonName}</div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">
            こんにちは、{customerName}様
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            次回のご来店時期やおすすめメニュー、最新のお知らせをここでまとめて確認できます。
          </p>

          <div className="mt-4 rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
            <div className="text-xs font-medium text-white/80">現在のご案内</div>
            <div className="mt-2 text-lg font-bold">{heroStatusText}</div>
            <div className="mt-3 flex gap-2">
              <Link
                href="/customer-app/reserve"
                className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-rose-500"
              >
                予約する
              </Link>
              <button
                type="button"
                onClick={() => showMessage("予約確認機能は次段階で実装します")}
                className="rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white"
              >
                予約確認
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">次回来店のおすすめ</div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {nextVisitWindow}
              </div>
            </div>
            <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600">
              再来促進
            </div>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            きれいな状態を保つなら、この時期のご来店がおすすめです。前回の施術内容に合わせて次回メニューもご提案しています。
          </p>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-sm font-bold text-slate-900">おすすめメニュー</div>
            <div className="mt-2 text-sm text-slate-600">
              フィルインメンテナンス / 季節デザインコース
            </div>
          </div>

          <Link
            href="/customer-app/reserve"
            className="mt-4 block w-full rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
          >
            次回予約する
          </Link>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">前回来店の内容</div>
            <Link
              href="/customer-app/history"
              className="text-sm font-bold text-rose-500"
            >
              履歴を見る
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回来店日</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {lastVisitDate}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回メニュー</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {lastMenu}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">担当スタッフ</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {lastStaff}
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            前回は春系の透明感カラーで施術しています。次回は色味を少し明るめにする提案が相性良さそうです。
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">今月のおすすめ</div>
            <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-600">
              単価アップ
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {recommendedMenus.map((menu) => (
              <div key={menu.id} className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {menu.title}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">
                      {menu.description}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                    {menu.price}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">口コミのお願い</div>
            <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-600">
              GBP連動
            </div>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            ご来店ありがとうございました。よろしければGoogle口コミのご投稿をお願いいたします。
          </p>

          <button
            type="button"
            onClick={() => showMessage("Google口コミ導線の接続は次段階で実装します")}
            className="mt-4 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white"
          >
            口コミを書く
          </button>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">キャンペーン / クーポン</div>
            <div className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">
              再来理由
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-gradient-to-r from-amber-50 to-rose-50 p-4">
            <div className="text-sm font-bold text-slate-900">
              次回来店特典キャンペーン
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              次回ご来店時にフィルインメニューをご利用の方へ、季節カラー追加提案をしています。
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">最新のお知らせ</div>
            <button
              type="button"
              onClick={() => showMessage("お知らせ一覧ページは次段階で実装します")}
              className="text-sm font-bold text-rose-500"
            >
              もっと見る
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {newsItems.map((item) => (
              <div key={item.id} className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-600">
                    {item.tag}
                  </div>
                  <div className="text-xs text-slate-400">{item.date}</div>
                </div>
                <div className="mt-3 text-sm font-bold text-slate-900">
                  {item.title}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {item.body}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {message ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-24px)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-blue-700">{message}</div>
              <button
                type="button"
                onClick={() => setMessage("")}
                className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-bold text-blue-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {navItems.map((item) => {
            const isActive = item.key === "home";

            if (item.href) {
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                    isActive
                      ? "bg-rose-50 text-rose-500"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span className="mt-1 leading-none">{item.label}</span>
                </Link>
              );
            }

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => showMessage(`${item.label} 画面は次段階で実装します`)}
                className="flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium text-gray-500 transition hover:text-gray-800"
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="mt-1 leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}