"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name?: string | null;
  kana?: string | null;
  phone?: string | null;
  email?: string | null;
};

type Visit = {
  id: string;
  customer_id: string;
  visit_date: string | null;
  menu_name: string | null;
  staff_name: string | null;
  price: number | string | null;
  memo: string | null;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params?.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    fetchCustomerDetail();
  }, [customerId]);

  async function fetchCustomerDetail() {
    setLoading(true);

    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single();

    if (customerError) {
      console.error("customer fetch error:", customerError);
      setCustomer(null);
    } else {
      setCustomer(customerData);
    }

    const { data: visitData, error: visitError } = await supabase
      .from("visits")
      .select("*")
      .eq("customer_id", customerId)
      .order("visit_date", { ascending: false });

    if (visitError) {
      console.error("visits fetch error:", visitError);
      setVisits([]);
    } else {
      setVisits(visitData || []);
    }

    setLoading(false);
  }

  function toNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;

    const cleaned = String(value).replace(/[^\d.-]/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  function formatYen(value: number) {
    return `¥${value.toLocaleString("ja-JP")}`;
  }

  const totalVisits = useMemo(() => visits.length, [visits]);

  const totalSales = useMemo(() => {
    return visits.reduce((sum, visit) => sum + toNumber(visit.price), 0);
  }, [visits]);

  const lastVisitDate = useMemo(() => {
    if (visits.length === 0) return "-";
    return visits[0]?.visit_date || "-";
  }, [visits]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 pb-24">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl bg-white p-6 shadow">読み込み中...</div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 pb-24">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl bg-white p-6 shadow">
            <p className="text-lg font-bold text-gray-900">
              顧客データが見つかりません
            </p>

            <div className="mt-4">
              <Link
                href="/customers"
                className="inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700"
              >
                顧客一覧へ戻る
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <Link
            href="/customers"
            className="text-sm font-medium text-blue-600"
          >
            ← 顧客一覧へ戻る
          </Link>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {customer.name || "名前未入力"}
              </h1>

              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <p>かな: {customer.kana || "-"}</p>
                <p>電話番号: {customer.phone || "-"}</p>
                <p>メール: {customer.email || "-"}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                href="/visits/new"
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
              >
                来店登録
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">来店回数</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {totalVisits}回
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">累計売上（LTV）</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {formatYen(totalSales)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">最終来店日</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {lastVisitDate}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-5 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">来店履歴</h2>
            <Link href="/visits" className="text-sm font-medium text-blue-600">
              来店一覧を見る
            </Link>
          </div>

          {visits.length === 0 ? (
            <p className="text-sm text-gray-500">来店履歴はありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="px-3 py-2">日付</th>
                    <th className="px-3 py-2">メニュー</th>
                    <th className="px-3 py-2">担当</th>
                    <th className="px-3 py-2">売上</th>
                    <th className="px-3 py-2">メモ</th>
                    <th className="px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((visit) => (
                    <tr key={visit.id} className="border-b last:border-b-0">
                      <td className="px-3 py-3">{visit.visit_date || "-"}</td>
                      <td className="px-3 py-3">{visit.menu_name || "-"}</td>
                      <td className="px-3 py-3">{visit.staff_name || "-"}</td>
                      <td className="px-3 py-3">
                        {formatYen(toNumber(visit.price))}
                      </td>
                      <td className="px-3 py-3">{visit.memo || "-"}</td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/visits/${visit.id}/edit`}
                          className="text-sm font-medium text-blue-600"
                        >
                          編集
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}