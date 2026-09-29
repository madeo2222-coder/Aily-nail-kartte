"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Visit = {
  id: string;
  customer_id: string;
  visit_date: string | null;
  menu_name: string | null;
  price: number | null;
  created_at: string | null;
};

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthPrefix() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export default function SalesDashboardPageClient() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const requestVersionRef = useRef(0);

  const fetchVisits = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setLoading(true);
    setErrorMessage("");
    setVisits([]);

    try {
      const { data, error } = await supabase
        .from("visits")
        .select("id, customer_id, visit_date, menu_name, price, created_at")
        .order("visit_date", { ascending: false });

      if (requestVersionRef.current !== requestVersion) {
        return;
      }

      if (error) {
        console.error("sales fetch error:", error);
        setErrorMessage(
          "売上データを取得できませんでした。集計値は表示していません。"
        );
        return;
      }

      setVisits((data as Visit[]) || []);
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) {
        return;
      }

      console.error("sales fetch error:", error);
      setErrorMessage(
        "売上データを取得できませんでした。集計値は表示していません。"
      );
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (active) {
        return fetchVisits();
      }
    });

    return () => {
      active = false;
      requestVersionRef.current += 1;
    };
  }, [fetchVisits]);

  const stats = useMemo(() => {
    const todayString = getTodayString();
    const monthPrefix = getMonthPrefix();

    let todaySales = 0;
    let monthSales = 0;
    let visitCount = 0;
    let totalSalesForAverage = 0;
    let averageTargetCount = 0;

    for (const visit of visits) {
      const visitDate = visit.visit_date ?? "";
      const price = Number(visit.price ?? 0);

      if (visitDate) {
        visitCount += 1;
      }

      if (visitDate === todayString) {
        todaySales += price;
      }

      if (visitDate.startsWith(monthPrefix)) {
        monthSales += price;
      }

      if (price > 0) {
        totalSalesForAverage += price;
        averageTargetCount += 1;
      }
    }

    const averageUnitPrice =
      averageTargetCount > 0 ? totalSalesForAverage / averageTargetCount : 0;

    return {
      todaySales,
      monthSales,
      visitCount,
      averageUnitPrice,
    };
  }, [visits]);

  return (
    <div className="p-4 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">売上ダッシュボード</h1>
          <p className="mt-1 text-sm text-gray-500">
            今日・今月の売上と来店状況を確認できます
          </p>
        </div>

        <Link
          href="/visits"
          className="rounded-lg border px-4 py-2 text-sm font-medium"
        >
          来店一覧へ
        </Link>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
          読み込み中...
        </div>
      ) : errorMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <p className="font-medium">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void fetchVisits()}
            className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-bold text-white"
          >
            再試行
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">今日の売上</p>
              <p className="mt-2 text-3xl font-bold">
                {formatYen(stats.todaySales)}
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">今月の売上</p>
              <p className="mt-2 text-3xl font-bold">
                {formatYen(stats.monthSales)}
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">来店数</p>
              <p className="mt-2 text-3xl font-bold">
                {stats.visitCount.toLocaleString("ja-JP")}件
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">平均単価</p>
              <p className="mt-2 text-3xl font-bold">
                {formatYen(stats.averageUnitPrice)}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">補足</h2>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p>・今日の売上：visit_date が今日のデータの price 合計</p>
              <p>・今月の売上：visit_date が今月のデータの price 合計</p>
              <p>・来店数：visits の件数</p>
              <p>・平均単価：price の平均値</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
