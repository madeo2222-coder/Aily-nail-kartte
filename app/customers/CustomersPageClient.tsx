"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  name_kana: string | null;
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
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: customersData } = await supabase
      .from("customers")
      .select("id, name, name_kana, allergy")
      .order("created_at", { ascending: false });

    if (customersData) setCustomers(customersData);

    const { data: visitsData } = await supabase
      .from("visits")
      .select("customer_id, next_visit_date, next_proposal, visit_date")
      .order("visit_date", { ascending: false });

    if (visitsData) setVisits(visitsData);
  }

  function getLatestVisit(customerId: string) {
    return visits.find((v) => v.customer_id === customerId);
  }

  const filteredCustomers = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();

    if (!trimmed) return customers;

    return customers.filter((customer) => {
      const name = (customer.name || "").toLowerCase();
      const nameKana = (customer.name_kana || "").toLowerCase();

      return name.includes(trimmed) || nameKana.includes(trimmed);
    });
  }, [customers, keyword]);

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold">顧客一覧</h1>

      <Link
        href="/customers/new"
        className="mb-4 block rounded bg-blue-500 py-2 text-center text-white"
      >
        ＋ 顧客を追加
      </Link>

      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          顧客検索
        </label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="名前 / フリガナで検索"
          className="w-full rounded-xl border px-4 py-3"
        />
        <p className="mt-2 text-xs text-gray-500">
          表示件数: {filteredCustomers.length}件
        </p>
      </div>

      <div className="space-y-3">
        {filteredCustomers.map((customer) => {
          const latest = getLatestVisit(customer.id);

          return (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className="block rounded border bg-white p-3 shadow-sm"
            >
              <div className="text-lg font-semibold">
                {customer.name || "顧客名なし"}
              </div>

              <div className="text-sm text-gray-500">
                フリガナ：{customer.name_kana || "-"}
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

        {filteredCustomers.length === 0 && (
          <div className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
            条件に合う顧客はいません
          </div>
        )}
      </div>
    </div>
  );
}