"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const BOOKING_URL = "https://example.com/reserve";
// ↑ここを実際の予約URLに差し替える
// 例:
// Hot Pepper Beauty
// LINE予約
// 自社予約フォーム
// など

const staffOptions = ["指名なし", "山田", "佐藤", "田中"];
const menuOptions = [
  "ワンカラー",
  "定額デザインコース",
  "フィルインメンテナンス",
  "フットネイル",
  "ケアメニュー",
];

const navItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "news", label: "お知らせ", icon: "📢", href: "" },
  { key: "mypage", label: "マイ", icon: "👤", href: "" },
];

function isBookingUrlReady(url: string) {
  return url.trim().length > 0 && !url.includes("example.com");
}

export default function CustomerAppReservePage() {
  const [message, setMessage] = useState("");
  const [selectedMenu, setSelectedMenu] = useState(menuOptions[0]);
  const [selectedStaff, setSelectedStaff] = useState(staffOptions[0]);
  const [selectedDate, setSelectedDate] = useState("2026-04-25");
  const [selectedTime, setSelectedTime] = useState("14:00");

  const bookingReady = isBookingUrlReady(BOOKING_URL);

  const summaryText = useMemo(() => {
    return `${selectedDate} ${selectedTime} / ${selectedMenu} / ${selectedStaff}`;
  }, [selectedDate, selectedTime, selectedMenu, selectedStaff]);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  function handleBookingClick() {
    if (!bookingReady) {
      showMessage("予約URL未設定です。BOOKING_URL を実URLに差し替えてください。");
      return;
    }

    window.open(BOOKING_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            CUSTOMER APP RESERVE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">予約する</h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            ご希望のメニュー、担当者、日時を選んで次回予約の流れを確認できます。
          </p>

          <div className="mt-4 flex gap-2">
            <Link
              href="/customer-app"
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-rose-500"
            >
              ホームへ戻る
            </Link>
            <Link
              href="/customer-app/history"
              className="rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white"
            >
              履歴を見る
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">予約内容を選択</div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                メニュー
              </label>
              <select
                value={selectedMenu}
                onChange={(e) => setSelectedMenu(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3"
              >
                {menuOptions.map((menu) => (
                  <option key={menu} value={menu}>
                    {menu}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                担当者
              </label>
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3"
              >
                {staffOptions.map((staff) => (
                  <option key={staff} value={staff}>
                    {staff}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                希望日
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                希望時間
              </label>
              <select
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3"
              >
                <option value="10:00">10:00</option>
                <option value="11:00">11:00</option>
                <option value="13:00">13:00</option>
                <option value="14:00">14:00</option>
                <option value="15:00">15:00</option>
                <option value="16:00">16:00</option>
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">予約確認</div>
            <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600">
              行動導線
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">現在の選択内容</div>
            <div className="mt-2 text-sm font-bold leading-6 text-slate-900">
              {summaryText}
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            この画面から実際の予約ページへ進める形にしています。実URLを入れれば、そのまま提案や広告でも使いやすくなります。
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleBookingClick}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
            >
              この内容で予約する
            </button>

            <button
              type="button"
              onClick={handleBookingClick}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              外部予約リンクで進む
            </button>
          </div>

          <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            今は外部予約URL連携方式です。Hot Pepper Beauty、LINE予約、自社フォームなどに接続できます。
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">予約の流れ</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">STEP 1</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                メニューを選ぶ
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">STEP 2</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                担当者と日時を選ぶ
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">STEP 3</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                内容確認後に予約ページへ進む
              </div>
            </div>
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
            const isActive = item.key === "reserve";

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