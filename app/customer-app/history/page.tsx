"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  name: string | null;
};

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  menu: string | null;
  menu_name: string | null;
  memo: string | null;
  next_proposal: string | null;
  staff_name: string | null;
  created_at: string | null;
};

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "news", label: "お知らせ", icon: "📢", href: "" },
  { key: "mypage", label: "マイ", icon: "👤", href: "" },
];

function formatDate(value: string | null) {
  if (!value) return "未登録";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未登録";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1);
  const day = String(date.getDate());

  return `${year}/${month}/${day}`;
}

function getDisplayMenu(visit: VisitRow) {
  if (visit.menu_name?.trim()) return visit.menu_name;
  if (visit.menu?.trim()) return visit.menu;
  return "メニュー未登録";
}

export default function CustomerAppHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [customerName, setCustomerName] = useState("お客様");
  const [visits, setVisits] = useState<VisitRow[]>([]);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }

      setIsLoggedIn(true);

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id, name")
        .eq("user_id", user.id)
        .single();

      if (customerError || !customer) {
        setErrorMessage(
          "お客様情報が見つかりませんでした。ログイン情報の確認が必要です。"
        );
        setLoading(false);
        return;
      }

      const currentCustomer = customer as CustomerRow;
      setCustomerName(currentCustomer.name || "お客様");

      const { data: visitData, error: visitError } = await supabase
        .from("visits")
        .select(
          "id, customer_id, visit_date, menu, menu_name, memo, next_proposal, staff_name, created_at"
        )
        .eq("customer_id", currentCustomer.id)
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (visitError) {
        setErrorMessage("来店履歴の取得に失敗しました。");
        setLoading(false);
        return;
      }

      setVisits((visitData || []) as VisitRow[]);
      setLoading(false);
    }

    fetchHistory();
  }, []);

  const visitCount = visits.length;
  const lastVisitDate = useMemo(() => {
    return visits[0]?.visit_date ? formatDate(visits[0].visit_date) : "未登録";
  }, [visits]);

  const recentSuggestion = useMemo(() => {
    const latest = visits.find((item) => item.next_proposal?.trim());
    return latest?.next_proposal?.trim() || "次回提案はまだ登録されていません";
  }, [visits]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">来店履歴</div>
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
            <h1 className="mt-2 text-2xl font-bold leading-tight">来店履歴</h1>
            <p className="mt-3 text-sm leading-6 text-white/90">
              来店履歴は会員ログイン後に確認できます。初めての方は初回入力からお進みください。
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <Link
                href="/customer-app/login"
                className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-900"
              >
                会員の方はこちら
              </Link>
              <Link
                href="/customer-intake"
                className="rounded-xl border border-white/30 px-4 py-3 text-center text-sm font-bold text-white"
              >
                初めての方はこちら
              </Link>
            </div>
          </section>

          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-base font-bold text-slate-900">履歴で確認できること</div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-bold text-slate-900">前回メニュー</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  これまでの施術内容を見返せます。
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-bold text-slate-900">担当スタッフ</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  前回担当者や記録メモを確認できます。
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-bold text-slate-900">次回提案</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  次回おすすめ時期やメニュー提案を確認できます。
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">来店履歴</div>
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {errorMessage}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <Link
                href="/customer-app"
                className="rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
              >
                ホームへ戻る
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">来店履歴</h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            {customerName}様の前回までの施術内容や次回提案を確認できます。
          </p>

          <div className="mt-4 flex gap-2">
            <Link
              href="/customer-app"
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900"
            >
              マイページへ戻る
            </Link>
            <Link
              href="/customer-app/reserve"
              className="rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white"
            >
              次回予約する
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">履歴サマリー</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">累計来店回数</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {visitCount}回
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回来店日</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {lastVisitDate}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">最近の次回提案</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {recentSuggestion}
              </div>
            </div>
          </div>
        </section>

        {visits.length === 0 ? (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-base font-bold text-slate-900">来店履歴</div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              まだ来店履歴がありません。ご予約後に履歴が反映されます。
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            {visits.map((item) => (
              <article
                key={item.id}
                className="rounded-3xl border bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-bold text-slate-900">
                    {getDisplayMenu(item)}
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {formatDate(item.visit_date)}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs text-slate-500">担当スタッフ</div>
                    <div className="mt-1 text-base font-bold text-slate-900">
                      {item.staff_name?.trim() ? item.staff_name : "未登録"}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs text-slate-500">施術メモ</div>
                    <div className="mt-1 text-sm leading-6 text-slate-700">
                      {item.memo?.trim() ? item.memo : "メモはまだありません"}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-rose-50 p-4">
                    <div className="text-xs text-rose-500">次回提案</div>
                    <div className="mt-1 text-sm font-bold leading-6 text-rose-700">
                      {item.next_proposal?.trim()
                        ? item.next_proposal
                        : "次回提案はまだありません"}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => {
            const isActive = item.key === "history";

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