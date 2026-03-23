"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";

export default function VisitsPage() {
  const searchParams = useSearchParams();

  const [visits, setVisits] = useState<any[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchVisits();
  }, [searchParams]);

  async function fetchVisits() {
    setLoading(true);

    const { data: visitsData, error: visitsError } = await supabase
      .from("visits")
      .select("*")
      .order("id", { ascending: false });

    if (visitsError) {
      console.error("来店一覧取得エラー:", visitsError);
      alert("来店一覧の取得に失敗しました");
      setLoading(false);
      return;
    }

    const visitRows = visitsData || [];
    setVisits(visitRows);

    const customerIds = Array.from(
      new Set(
        visitRows
          .map((visit: any) => visit.customer_id)
          .filter((id: any) => !!id)
      )
    );

    if (customerIds.length > 0) {
      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds);

      if (customersError) {
        console.error("顧客取得エラー:", customersError);
        setCustomerMap({});
      } else {
        const map: Record<string, string> = {};
        (customersData || []).forEach((customer: any) => {
          map[customer.id] = customer.name || "未登録";
        });
        setCustomerMap(map);
      }
    } else {
      setCustomerMap({});
    }

    setLoading(false);
  }

  async function handleDeleteVisit(id: string) {
    const ok = window.confirm("この来店データを削除しますか？");
    if (!ok) return;

    setDeletingId(id);

    const { error } = await supabase.from("visits").delete().eq("id", id);

    if (error) {
      console.error("来店削除エラー:", error);
      alert("来店データの削除に失敗しました");
      setDeletingId(null);
      return;
    }

    alert("削除しました");
    setDeletingId(null);
    fetchVisits();
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return "-";
    return String(value).includes("T") ? String(value).split("T")[0] : String(value);
  }

  function formatYen(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") return "0";
    return Number(value).toLocaleString();
  }

  function getCustomerName(customerId: string | null | undefined) {
    if (!customerId) return "未登録";
    return customerMap[customerId] || "未登録";
  }

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">来店一覧</h1>

      <Link
        href="/visits/new"
        className="block bg-black text-white text-center py-4 rounded-2xl mb-4 text-xl font-semibold"
      >
        ＋ 来店登録
      </Link>

      {loading ? (
        <p className="text-center text-gray-500 py-8">読み込み中...</p>
      ) : visits.length === 0 ? (
        <div className="border rounded-2xl p-6 text-center text-gray-500 bg-white">
          データなし
        </div>
      ) : (
        <div className="space-y-4">
          {visits.map((visit) => (
            <div
              key={visit.id}
              className="border-[3px] border-black rounded-2xl p-5 bg-white"
            >
              <p className="text-2xl font-bold mb-3">
                顧客名：{getCustomerName(visit.customer_id)}
              </p>

              <div className="space-y-2 text-2xl leading-tight">
                <p>日付：{formatDate(visit.visit_date)}</p>
                <p>メニュー：{visit.menu_name || "-"}</p>
                <p>担当：{visit.staff_name || "-"}</p>
                <p>金額：¥{formatYen(visit.price)}</p>
                <p>メモ：{visit.memo || "-"}</p>
              </div>

              <div className="flex gap-3 mt-5 flex-wrap">
                <Link
                  href={`/sales-payments?visit_id=${visit.id}`}
                  className="border-[3px] border-black rounded-2xl px-4 py-3 text-lg font-bold text-center"
                >
                  会計へ
                </Link>

                <Link
                  href={`/visits/${visit.id}/edit`}
                  className="border-[3px] border-black rounded-2xl px-4 py-3 text-lg font-bold text-center"
                >
                  編集
                </Link>

                <button
                  onClick={() => handleDeleteVisit(visit.id)}
                  disabled={deletingId === visit.id}
                  className="bg-red-500 text-white px-4 py-3 rounded-2xl text-lg font-bold disabled:opacity-50"
                >
                  {deletingId === visit.id ? "削除中..." : "削除"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}