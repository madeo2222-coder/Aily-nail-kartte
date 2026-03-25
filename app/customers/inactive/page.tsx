"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type CustomerWithLastVisit = {
  id: string;
  name: string;
  last_visit_date: string | null;
};

export default function InactiveCustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithLastVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInactiveCustomers();
  }, []);

  async function fetchInactiveCustomers() {
    setLoading(true);

    // ① 全顧客取得
    const { data: customersData, error: customersError } = await supabase
      .from("customers")
      .select("id, name");

    if (customersError) {
      console.error("顧客取得エラー:", customersError);
      setLoading(false);
      return;
    }

    // ② 各顧客の最終来店日取得
    const results: CustomerWithLastVisit[] = [];

    for (const customer of customersData || []) {
      const { data: visitData } = await supabase
        .from("visits")
        .select("visit_date")
        .eq("customer_id", customer.id)
        .order("visit_date", { ascending: false })
        .limit(1);

      const lastVisit = visitData?.[0]?.visit_date || null;

      results.push({
        id: customer.id,
        name: customer.name,
        last_visit_date: lastVisit,
      });
    }

    // ③ 30日以上来てない顧客だけ抽出
    const now = new Date();

    const inactive = results.filter((c) => {
      if (!c.last_visit_date) return true;

      const last = new Date(c.last_visit_date);
      const diffDays =
        (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

      return diffDays >= 30;
    });

    setCustomers(inactive);
    setLoading(false);
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="text-2xl font-bold mb-4">未回来店顧客（30日以上）</h1>

      <div className="mb-4">
        <Link
          href="/customers"
          className="inline-block px-4 py-2 border rounded-xl"
        >
          ← 顧客一覧へ
        </Link>
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : customers.length === 0 ? (
        <p>未回来店の顧客はいません 👍</p>
      ) : (
        <div className="space-y-3">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="block border rounded-xl p-4 bg-white"
            >
              <p className="text-lg font-bold">{c.name}</p>
              <p className="text-sm text-gray-500">
                最終来店: {c.last_visit_date || "なし"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}