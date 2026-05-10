"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const menuOptions = [
  "ワンカラー",
  "定額デザインコース",
  "フィルインメンテナンス",
  "ケアメニュー",
  "開運ネイル相談",
  "ネイルチップ相談",
];

type MeResponse = {
  authenticated: boolean;
  customer?: {
    id?: string;
    salon_id?: string | null;
    name?: string | null;
  };
};

type StaffRow = {
  id: string;
  name: string | null;
};

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "diagnosis", label: "診断", icon: "✨", href: "/customer-app/sanmeigaku" },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "mypage", label: "マイ", icon: "👤", href: "" },
];

function ReservePageContent() {
  const searchParams = useSearchParams();
  const menuFromQuery = searchParams.get("menu");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [salonId, setSalonId] = useState("");

  const [selectedMenu, setSelectedMenu] = useState(
    menuFromQuery || menuOptions[0]
  );
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    async function checkAuthAndLoadStaffs() {
      try {
        const res = await fetch("/api/line-login/me", { cache: "no-store" });
        const json = (await res.json()) as MeResponse;

        setIsLoggedIn(!!json.authenticated);
        setCustomerId(json.customer?.id || "");
        setSalonId(json.customer?.salon_id || "");

        const { data, error } = await supabase
          .from("staffs")
          .select("id, name")
          .order("name", { ascending: true });

        if (error) {
          console.error("staffs fetch error:", error.message);
          setStaffs([]);
        } else {
          setStaffs((data as StaffRow[]) || []);
        }
      } catch {
        setIsLoggedIn(false);
        setCustomerId("");
        setSalonId("");
        setStaffs([]);
      } finally {
        setLoading(false);
      }
    }

    checkAuthAndLoadStaffs();
  }, []);

  const selectedStaffName = useMemo(() => {
    if (!selectedStaffId) return "指名なし";
    return staffs.find((staff) => staff.id === selectedStaffId)?.name || "未設定";
  }, [selectedStaffId, staffs]);

  const summaryText = useMemo(() => {
    const dateText = selectedDate || "未選択";
    const timeText = selectedTime || "未選択";
    return `${dateText} ${timeText} / ${selectedMenu} / ${selectedStaffName}`;
  }, [selectedDate, selectedTime, selectedMenu, selectedStaffName]);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  async function handleReserveSubmit() {
    if (!selectedDate) {
      showMessage("希望日を選択してください");
      return;
    }

    if (!selectedTime) {
      showMessage("希望時間を選択してください");
      return;
    }

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          menu: selectedMenu,
          date: selectedDate,
          time: selectedTime,
          staffId: selectedStaffId,
          customerId,
          salonId,
          memo:
            selectedMenu === "開運ネイル相談"
              ? `AI算命学診断経由\n${note}`
              : note,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        showMessage(json.error || "予約保存に失敗しました");
        return;
      }

      showMessage("予約希望を受け付けました");
      setNote("");
    } catch (error) {
      console.error(error);
      showMessage("通信エラーが発生しました");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">予約ページ</div>
            <div className="mt-3 text-sm text-slate-600">読み込み中...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-5 text-white shadow">
            <div className="text-xs font-bold tracking-wide opacity-90">
              AILY MY PAGE
            </div>
            <h1 className="mt-2 text-2xl font-bold leading-tight">予約する</h1>
            <p className="mt-3 text-sm leading-6 text-white/90">
              会員のお客様はLINEログイン後にご予約へ、初めてのお客様は初回入力後にご案内いたします。
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <Link
                href="/customer-app/login"
                className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-rose-500"
              >
                LINEでログイン
              </Link>
              <Link
                href="/customer-intake"
                className="rounded-xl border border-white/30 px-4 py-3 text-center text-sm font-bold text-white"
              >
                初めての方はこちら
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">予約する</h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            ご希望の日時・メニューを入力してください。診断結果をもとにした開運ネイル相談も選べます。
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">予約内容</div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                希望日
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                希望時間
              </label>
              <select
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                <option value="">選択してください</option>
                <option value="10:00">10:00</option>
                <option value="11:00">11:00</option>
                <option value="13:00">13:00</option>
                <option value="14:00">14:00</option>
                <option value="15:00">15:00</option>
                <option value="16:00">16:00</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                メニュー
              </label>
              <select
                value={selectedMenu}
                onChange={(e) => setSelectedMenu(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
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
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                <option value="">指名なし</option>
                {staffs.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name || "名前未設定"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                ご要望・備考
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="例：診断結果のラッキーカラーを使いたい、爪が薄い、オフィス向けにしたい等"
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">予約確認</div>
            <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600">
              確認
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">現在の選択内容</div>
            <div className="mt-2 text-sm font-bold leading-6 text-slate-900">
              {summaryText}
            </div>
            {note.trim() ? (
              <div className="mt-3 text-sm leading-6 text-slate-600">
                {note}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleReserveSubmit}
            className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
          >
            この内容で予約希望を送る
          </button>

          <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            予約内容はスタッフ側予約一覧に反映されます。確定連絡は店舗からのご案内をお待ちください。
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
          {signedInNavItems.map((item) => {
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

export default function CustomerAppReservePage() {
  return (
    <Suspense fallback={null}>
      <ReservePageContent />
    </Suspense>
  );
}