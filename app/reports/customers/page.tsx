"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerSales = {
  customer_name: string;
  total_sales: number;
  visit_count: number;
};

export default function CustomerReportPage() {
  const [data, setData] = useState<CustomerSales[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data, error } = await supabase
      .from("visits")
      .select(`
        price,
        customers(name)
      `);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const map: Record<string, CustomerSales> = {};

    (data as any[]).forEach((row) => {
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
    setLoading(false);
  }

  function formatYen(value: number) {
    return `¥${value.toLocaleString("ja-JP")}`;
  }

  if (loading) {
    return <div className="p-4">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="text-2xl font-bold mb-4">顧客別売上</h1>

      <div className="space-y-3">
        {data.map((row, index) => (
          <div
            key={index}
            className="rounded-xl border p-4 flex justify-between items-center"
          >
            <div>
              <p className="font-bold">{row.customer_name}</p>
              <p className="text-sm text-gray-500">
                来店数: {row.visit_count}回
              </p>
            </div>

            <p className="text-lg font-bold">
              {formatYen(row.total_sales)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}