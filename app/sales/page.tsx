"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function SalesPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchSales();
  }, []);

  async function fetchSales() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("sale_date", { ascending: false });

    setLoading(false);

    if (error) {
      console.error(error);
      alert("売上一覧の取得に失敗しました");
      return;
    }

    setSales(data || []);
  }

  async function handleDeleteSale(id: string) {
    const ok = window.confirm("この売上を削除しますか？");
    if (!ok) return;

    setDeletingId(id);

    const { error } = await supabase
      .from("sales")
      .delete()
      .eq("id", id);

    setDeletingId(null);

    if (error) {
      console.error(error);
      alert("削除に失敗しました");
      return;
    }

    alert("削除しました");
    fetchSales();
  }

  function formatDate(date: string) {
    if (!date) return "-";
    return date.includes("T") ? date.split("T")[0] : date;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">売上一覧</h1>
        <Link
          href="/sales-payments"
          className="bg-black text-white px-4 py-2 rounded"
        >
          会計登録
        </Link>
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : sales.length === 0 ? (
        <p>データがありません</p>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <div
              key={sale.id}
              className="border rounded p-4 flex justify-between items-start"
            >
              <div className="text-sm space-y-1">
                <div>日付：{formatDate(sale.sale_date)}</div>
                <div>顧客ID：{sale.customer_id}</div>
                <div>メニュー：{sale.menu_name}</div>
                <div>担当：{sale.staff_name}</div>
                <div>金額：¥{sale.amount?.toLocaleString()}</div>
                <div>支払方法：{sale.payment_method}</div>
              </div>

              <button
                onClick={() => handleDeleteSale(sale.id)}
                disabled={deletingId === sale.id}
                className="bg-red-500 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
              >
                {deletingId === sale.id ? "削除中..." : "削除"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}