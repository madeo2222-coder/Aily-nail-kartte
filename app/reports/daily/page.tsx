"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Visit = {
  id: string;
  visit_date?: string | null;
  price?: number | null;
};

type DailyRow = {
  date: string;
  sales: number;
  count: number;
};

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getNextMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function toDateOnlyString(date: Date) {
  return date.toISOString().split("T")[0];
}

export default function DailyReportsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchVisits();
  }, []);

  async function fetchVisits() {
    try {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("visits")
        .select("id, visit_date, price")
        .order("visit_date", { ascending: false });

      if (error) {
        console.error("visits取得エラー:", error);
        setMessage(`来店情報の取得に失敗しました: ${error.message}`);
        setVisits([]);
        return;
      }

      const normalized: Visit[] = (data || []).map((visit: any) => ({
        id: visit.id,
        visit_date: visit.visit_date ?? null,
        price:
          typeof visit.price === "number"
            ? visit.price
            : visit.price
            ? Number(visit.price)
            : null,
      }));

      setVisits(normalized);
    } catch (err) {
      console.error("予期しないエラー:", err);
      setMessage("予期しないエラーが発生しました");
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }

  const dailyRows = useMemo(() => {
    const now = new Date();
    const monthStart = getMonthStart(now);
    const nextMonthStart = getNextMonthStart(now);

    const monthVisits = visits.filter((visit) => {
      if (!visit.visit_date) return false;
      const visitDate = new Date(visit.visit_date);
      return visitDate >= monthStart && visitDate < nextMonthStart;
    });

    const map = new Map<string, DailyRow>();

    for (const visit of monthVisits) {
      const date = visit.visit_date as string;
      const current = map.get(date) || { date, sales: 0, count: 0 };

      current.sales += visit.price || 0;
      current.count += 1;

      map.set(date, current);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.date < b.date ? 1 : -1
    );
  }, [visits]);

  const todayString = toDateOnlyString(new Date());

  const todayRow = useMemo(() => {
    return (
      dailyRows.find((row) => row.date === todayString) || {
        date: todayString,
        sales: 0,
        count: 0,
      }
    );
  }, [dailyRows, todayString]);

  const monthlySales = useMemo(() => {
    return dailyRows.reduce((sum, row) => sum + row.sales, 0);
  }, [dailyRows]);

  const monthlyCount = useMemo(() => {
    return dailyRows.reduce((sum, row) => sum + row.count, 0);
  }, [dailyRows]);

  function formatPrice(value: number) {
    return `¥${value.toLocaleString()}`;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">日別売上</h1>
          <Link
            href="/"
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            ホームへ
          </Link>
        </div>

        {message && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">読み込み中...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">今日の売上</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatPrice(todayRow.sales)}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  来店件数: {todayRow.count}件
                </p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">今月売上</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatPrice(monthlySales)}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">今月来店件数</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {monthlyCount}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-gray-900">今月の日別内訳</h2>

              {dailyRows.length === 0 ? (
                <p className="text-gray-500">今月のデータはまだありません</p>
              ) : (
                <div className="space-y-3">
                  {dailyRows.map((row) => (
                    <div
                      key={row.date}
                      className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 p-4 md:grid-cols-3"
                    >
                      <div>
                        <p className="text-sm text-gray-500">日付</p>
                        <p className="text-lg font-bold text-gray-900">
                          {row.date}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-gray-500">売上</p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatPrice(row.sales)}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-gray-500">来店件数</p>
                        <p className="text-lg font-bold text-gray-900">
                          {row.count}件
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}