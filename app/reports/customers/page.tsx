"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerSales = {
  customer_name: string;
  total_sales: number;
  visit_count: number;
};

type CustomerSalesQueryRow = {
  price?: number | string | null;
  customers?: { name?: string | null } | null;
};

export default function CustomerReportPage() {
  const [data, setData] = useState<CustomerSales[]>([]);
  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");
  const requestVersion = useRef(0);

  const fetchData = useCallback(async () => {
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current;
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("visits")
        .select(`
          price,
          customers(name)
        `);

      if (!isCurrent()) return;
      if (error) throw error;

      const map: Record<string, CustomerSales> = {};

      (data as CustomerSalesQueryRow[] | null)?.forEach((row) => {
        const name = row.customers?.name || "不明";
        const price = Number(row.price || 0);

        if (!map[name]) {
          map[name] = {
            customer_name: name,
            total_sales: 0,
            visit_count: 0,
          };
        }

        map[name].total_sales += price;
        map[name].visit_count += 1;
      });

      const result = Object.values(map).sort(
        (a, b) => b.total_sales - a.total_sales
      );

      setData(result);
    } catch (error) {
      if (!isCurrent()) return;
      console.error("顧客別売上取得エラー:", error);
      setData([]);
      setErrorMessage("顧客別売上を取得できませんでした。通信状態を確認して再試行してください。");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void fetchData();
    });
    return () => {
      active = false;
      requestVersion.current += 1;
    };
  }, [fetchData]);

  function formatYen(value: number) {
    return `¥${value.toLocaleString("ja-JP")}`;
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-4 text-2xl font-bold">顧客別売上</h1>

      {errorMessage ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{errorMessage}</p>
          <button type="button" onClick={() => void fetchData()} className="mt-3 rounded-lg border px-4 py-2">
            再試行
          </button>
        </div>
      ) : data.length === 0 ? (
        <p>顧客別売上データはありません。</p>
      ) : (
        <div className="space-y-3">
          {data.map((row, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-xl border p-4"
            >
              <div>
                <p className="font-bold">{row.customer_name}</p>
                <p className="text-sm text-gray-500">
                  来店数: {row.visit_count}回
                </p>
              </div>

              <p className="text-lg font-bold">{formatYen(row.total_sales)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
