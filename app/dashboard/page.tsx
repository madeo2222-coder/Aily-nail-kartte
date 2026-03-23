"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Visit = {
  id: string;
  visit_date: string | null;
  price: number | string | null;
};

export default function DashboardPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [todayStr, setTodayStr] = useState("");
  const [thisMonthStr, setThisMonthStr] = useState("");

  useEffect(() => {
    setMounted(true);

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    setTodayStr(`${yyyy}-${mm}-${dd}`);
    setThisMonthStr(`${yyyy}-${mm}`);

    fetchVisits();
  }, []);

  async function fetchVisits() {
    setLoading(true);

    const { data, error } = await supabase
      .from("visits")
      .select("id, visit_date, price")
      .order("visit_date", { ascending: false });

    if (error) {
      console.error("dashboard fetch error:", error);
      setVisits([]);
      setLoading(false);
      return;
    }

    setVisits(data || []);
    setLoading(false);
  }

  function toNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;

    const cleaned = String(value).replace(/[^\d.-]/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  function isToday(dateString: string | null) {
    if (!dateString || !todayStr) return false;
    return dateString.slice(0, 10) === todayStr;
  }

  function isThisMonth(dateString: string | null) {
    if (!dateString || !thisMonthStr) return false;
    return dateString.slice(0, 7) === thisMonthStr;
  }

  const todaySales = useMemo(() => {
    return visits
      .filter((visit) => isToday(visit.visit_date))
      .reduce((sum, visit) => sum + toNumber(visit.price), 0);
  }, [visits, todayStr]);

  const monthSales = useMemo(() => {
    return visits
      .filter((visit) => isThisMonth(visit.visit_date))
      .reduce((sum, visit) => sum + toNumber(visit.price), 0);
  }, [visits, thisMonthStr]);

  const totalSales = useMemo(() => {
    return visits.reduce((sum, visit) => sum + toNumber(visit.price), 0);
  }, [visits]);

  const todayCount = useMemo(() => {
    return visits.filter((visit) => isToday(visit.visit_date)).length;
  }, [visits, todayStr]);

  const monthCount = useMemo(() => {
    return visits.filter((visit) => isThisMonth(visit.visit_date)).length;
  }, [visits, thisMonthStr]);

  function formatYen(value: number) {
    return `¥${value.toLocaleString("ja-JP")}`;
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-xl bg-white p-6 shadow">読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>

          <Link
            href="/visits/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            来店登録
          </Link>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white p-6 shadow">読み込み中...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-gray-500">今日の売上</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatYen(todaySales)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  来店数: {todayCount}件
                </p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-gray-500">今月の売上</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatYen(monthSales)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  来店数: {monthCount}件
                </p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-gray-500">累計売上</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatYen(totalSales)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  総来店数: {visits.length}件
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-white p-5 shadow">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">最近の来店</h2>
                <Link
                  href="/visits"
                  className="text-sm font-medium text-blue-600"
                >
                  一覧を見る
                </Link>
              </div>

              {visits.length === 0 ? (
                <p className="text-sm text-gray-500">来店データがありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="px-3 py-2">日付</th>
                        <th className="px-3 py-2">売上</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visits.slice(0, 10).map((visit) => (
                        <tr key={visit.id} className="border-b last:border-b-0">
                          <td className="px-3 py-3">
                            {visit.visit_date || "-"}
                          </td>
                          <td className="px-3 py-3">
                            {formatYen(toNumber(visit.price))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/visits"
                className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm"
              >
                来店一覧へ
              </Link>

              <Link
                href="/visits/new"
                className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm"
              >
                来店登録へ
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}