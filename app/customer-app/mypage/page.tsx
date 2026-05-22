"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  name: string | null;
  salon_id: string | null;
  phone?: string | null;
  line_name?: string | null;
};

type SalonRow = {
  id: string;
  name: string | null;
};

type VisitRow = {
  id: string;
  visit_date: string | null;
  menu: string | null;
  menu_name: string | null;
  created_at: string | null;
};

type ReservationRow = {
  id: string;
  menu: string | null;
  start_at: string | null;
  status: string | null;
};

type MeResponse = {
  authenticated: boolean;
  customer?: CustomerRow | null;
};

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  {
    key: "diagnosis",
    label: "診断",
    icon: "✨",
    href: "/customer-app/sanmeigaku",
  },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "mypage", label: "マイ", icon: "👤", href: "/customer-app/mypage" },
];

function formatDate(value: string | null) {
  if (!value) return "未登録";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未登録";

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "未登録";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未登録";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

function getDisplayMenu(visit: VisitRow | null) {
  if (!visit) return "未登録";
  if (visit.menu_name?.trim()) return visit.menu_name;
  if (visit.menu?.trim()) return visit.menu;
  return "メニュー未登録";
}

export default function CustomerAppMyPage() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [salonName, setSalonName] = useState("Aily Nail Studio");
  const [latestVisit, setLatestVisit] = useState<VisitRow | null>(null);
  const [nextReservation, setNextReservation] = useState<ReservationRow | null>(
    null
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchMyPage() {
      setLoading(true);
      setMessage("");

      try {
        const meRes = await fetch("/api/line-login/me", {
          cache: "no-store",
        });

        const meJson = (await meRes.json()) as MeResponse;

        if (!meJson.authenticated || !meJson.customer) {
          setIsLoggedIn(false);
          setLoading(false);
          return;
        }

        setIsLoggedIn(true);
        setCustomer(meJson.customer);

        if (meJson.customer.salon_id) {
          const { data: salonData } = await supabase
            .from("salons")
            .select("id, name")
            .eq("id", meJson.customer.salon_id)
            .single();

          if (salonData) {
            const salon = salonData as SalonRow;
            setSalonName(salon.name || "Aily Nail Studio");
          }
        }

        const { data: visitData } = await supabase
          .from("visits")
          .select("id, visit_date, menu, menu_name, created_at")
          .eq("customer_id", meJson.customer.id)
          .order("visit_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        setLatestVisit(((visitData || [])[0] as VisitRow | undefined) || null);

        const nowIso = new Date().toISOString();

        const { data: reservationData } = await supabase
          .from("reservations")
          .select("id, menu, start_at, status")
          .eq("customer_id", meJson.customer.id)
          .neq("status", "キャンセル")
          .gte("start_at", nowIso)
          .order("start_at", { ascending: true })
          .limit(1);

        setNextReservation(
          ((reservationData || [])[0] as ReservationRow | undefined) || null
        );
      } catch (error) {
        console.error("mypage取得エラー:", error);
        setMessage("マイページ情報の取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchMyPage();
  }, []);

  const customerName = useMemo(() => {
    return customer?.name || "お客様";
  }, [customer]);

  async function handleLogout() {
    await fetch("/api/line-login/logout", {
      method: "POST",
    });

    window.location.href = "/customer-app";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">マイページ</div>
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
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow">
            <div className="text-xs font-bold tracking-wide opacity-90">
              AILY MY PAGE
            </div>
            <h1 className="mt-2 text-2xl font-bold leading-tight">
              マイページ
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/90">
              マイページはLINEログイン後に確認できます。
            </p>

            <Link
              href="/customer-app/login"
              className="mt-4 block rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-900"
            >
              LINEでログイン
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <div className="mt-2 text-sm opacity-90">{salonName}</div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">
            {customerName}様のマイページ
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            登録情報、前回来店、次回予約を確認できます。
          </p>
        </section>

        {message ? (
          <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
            {message}
          </section>
        ) : null}

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">お客様情報</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">お名前</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {customer?.name || "未登録"}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">サロン</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {salonName}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">前回来店</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回来店日</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {formatDate(latestVisit?.visit_date || null)}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回メニュー</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {getDisplayMenu(latestVisit)}
              </div>
            </div>
          </div>

          <Link
            href="/customer-app/history"
            className="mt-4 block w-full rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
          >
            来店履歴を見る
          </Link>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">次回予約</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">予約日時</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {formatDateTime(nextReservation?.start_at || null)}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">メニュー</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {nextReservation?.menu || "未登録"}
              </div>
            </div>
          </div>

          <Link
            href="/customer-app/reserve"
            className="mt-4 block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700"
          >
            予約ページへ
          </Link>
        </section>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
        >
          ログアウト
        </button>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => {
            const isActive = item.key === "mypage";

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
          })}
        </div>
      </nav>
    </main>
  );
}