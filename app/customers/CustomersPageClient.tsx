"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  allergy: string | null;
};

type Visit = {
  customer_id: string;
  next_visit_date: string | null;
  next_proposal: string | null;
  visit_date: string;
};

export default function CustomersPageClient() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    // 顧客取得
    const { data: customersData } = await supabase
      .from("customers")
      .select("id, name, allergy")
      .order("created_at", { ascending: false });

    if (customersData) setCustomers(customersData);

    // 来店履歴取得（新しい順）
    const { data: visitsData } = await supabase
      .from("visits")
      .select("customer_id, next_visit_date, next_proposal, visit_date")
      .order("visit_date", { ascending: false });

    if (visitsData) setVisits(visitsData);
  }

  // 最新visit取得
  function getLatestVisit(customerId: string) {
    return visits.find((v) => v.customer_id === customerId);
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="text-xl font-bold mb-4">顧客一覧</h1>

      <Link
        href="/customers/new"
        className="block bg-blue-500 text-white text-center py-2 rounded mb-4"
      >
        ＋ 顧客を追加
      </Link>

      <div className="space-y-3">
        {customers.map((customer) => {
          const latest = getLatestVisit(customer.id);

          return (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className="block border p-3 rounded shadow-sm bg-white"
            >
              <div className="font-semibold text-lg">
                {customer.name || "顧客名なし"}
              </div>

              {customer.allergy && (
                <div className="text-sm text-red-500">
                  アレルギー：{customer.allergy}
                </div>
              )}

              {latest?.next_visit_date && (
                <div className="text-sm text-blue-600">
                  次回来店：{latest.next_visit_date}
                </div>
              )}

              {latest?.next_proposal && (
                <div className="text-sm text-green-600">
                  提案：{latest.next_proposal}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}