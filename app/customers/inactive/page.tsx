"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const [errorMessage, setErrorMessage] = useState("");
  const requestVersion = useRef(0);

  const fetchInactiveCustomers = useCallback(async () => {
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current;
    setLoading(true);
    setErrorMessage("");

    try {
      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("id, name");

      if (!isCurrent()) return;
      if (customersError) throw customersError;

      const results: CustomerWithLastVisit[] = [];
      for (const customer of customersData || []) {
        const { data: visitData, error: visitError } = await supabase
          .from("visits")
          .select("visit_date")
          .eq("customer_id", customer.id)
          .order("visit_date", { ascending: false })
          .limit(1);

        if (!isCurrent()) return;
        if (visitError) throw visitError;

        results.push({
          id: customer.id,
          name: customer.name,
          last_visit_date: visitData?.[0]?.visit_date || null,
        });
      }

      // 全顧客の来店履歴を取得できた場合だけ未回来店を判定する。
      const now = new Date();
      const inactive = results.filter((c) => {
        if (!c.last_visit_date) return true;
        const last = new Date(c.last_visit_date);
        const diffDays =
          (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays >= 30;
      });
      setCustomers(inactive);
    } catch (error) {
      if (!isCurrent()) return;
      console.error("未回来店顧客取得エラー:", error);
      setCustomers([]);
      setErrorMessage("顧客・来店履歴を取得できませんでした。通信状態を確認して再試行してください。");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void fetchInactiveCustomers();
    });
    return () => {
      active = false;
      requestVersion.current += 1;
    };
  }, [fetchInactiveCustomers]);

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
      ) : errorMessage ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{errorMessage}</p>
          <button type="button" onClick={() => void fetchInactiveCustomers()} className="mt-3 rounded-lg border px-4 py-2">
            再試行
          </button>
        </div>
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
