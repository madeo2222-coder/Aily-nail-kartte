"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string | null;
};

type Visit = {
  id: string;
  customer_id: string;
  visit_date: string | null;
  price: number | null;
  next_visit_date: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string | null;
  visitCount: number;
  ltv: number;
  lastVisitDate: string | null;
  nextVisitDate: string | null;
};

export default function CustomersPageClient() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") || "all";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("id, name, phone, created_at")
      .order("created_at", { ascending: false });

    if (customerError) {
      console.error("customers fetch error:", customerError);
      setLoading(false);
      return;
    }

    const { data: visitData, error: visitError } = await supabase
      .from("visits")
      .select("id, customer_id, visit_date, price, next_visit_date")
      .order("visit_date", { ascending: false });

    if (visitError) {
      console.error("visits fetch error:", visitError);
      setLoading(false);
      return;
    }

    setCustomers(customerData || []);
    setVisits(visitData || []);
    setLoading(false);
  }

  function diffDaysFromToday(dateStr: string | null) {
    if (!dateStr) return null;
    const today = new Date();
    const baseToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const target = new Date(dateStr);
    const baseTarget = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate()
    );
    const diffMs = baseToday.getTime() - baseTarget.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  const customerRows = useMemo<CustomerRow[]>(() => {
    return customers.map((customer) => {
      const customerVisits = visits.filter((v) => v.customer_id === customer.id);

      const visitCount = customerVisits.length;
      const ltv = customerVisits.reduce((sum, v) => sum + (v.price || 0), 0);

      const sortedByVisitDate = [...customerVisits].sort((a, b) => {
        return new Date(b.visit_date || 0).getTime() - new Date(a.visit_date || 0).getTime();
      });

      const lastVisitDate =
        sortedByVisitDate.length > 0 ? sortedByVisitDate[0].visit_date : null;

      const futureNextVisitDates = customerVisits
        .map((v) => v.next_visit_date)
        .filter((d): d is string => !!d)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      const nextVisitDate =
        futureNextVisitDates.length > 0 ? futureNextVisitDates[0] : null;

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        created_at: customer.created_at,
        visitCount,
        ltv,
        lastVisitDate,
        nextVisitDate,
      };
    });
  }, [customers, visits]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return customerRows;

    if (filter === "upcoming") {
      return customerRows.filter((row) => !!row.nextVisitDate);
    }

    if (filter === "follow") {
      return customerRows.filter((row) => {
        const days = diffDaysFromToday(row.lastVisitDate);
        return days !== null && days < 30 && !row.nextVisitDate;
      });
    }

    if (filter === "lost") {
      return customerRows.filter((row) => {
        const days = diffDaysFromToday(row.lastVisitDate);
        return days !== null && days >= 30 && !row.nextVisitDate;
      });
    }

    return customerRows;
  }, [customerRows, filter]);

  function formatDate(date: string | null) {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("ja-JP");
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">顧客一覧</h1>
        <Link
          href="/customers/new"
          className="px-4 py-2 rounded-lg bg-black text-white text-sm"
        >
          新規顧客追加
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-2 rounded-lg border text-sm whitespace-nowrap ${
            filter === "all" ? "bg-black text-white" : "bg-white"
          }`}
        >
          すべて
        </button>
        <button
          onClick={() => setFilter("upcoming")}
          className={`px-3 py-2 rounded-lg border text-sm whitespace-nowrap ${
            filter === "upcoming" ? "bg-black text-white" : "bg-white"
          }`}
        >
          次回来店予定
        </button>
        <button
          onClick={() => setFilter("follow")}
          className={`px-3 py-2 rounded-lg border text-sm whitespace-nowrap ${
            filter === "follow" ? "bg-black text-white" : "bg-white"
          }`}
        >
          フォロー必要
        </button>
        <button
          onClick={() => setFilter("lost")}
          className={`px-3 py-2 rounded-lg border text-sm whitespace-nowrap ${
            filter === "lost" ? "bg-black text-white" : "bg-white"
          }`}
        >
          失客
        </button>
      </div>

      <div className="space-y-3">
        {filteredRows.length === 0 ? (
          <div className="border rounded-xl p-4 bg-white text-sm text-gray-500">
            顧客がいません
          </div>
        ) : (
          filteredRows.map((row) => (
            <Link
              key={row.id}
              href={`/customers/${row.id}`}
              className="block border rounded-xl p-4 bg-white shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-lg">{row.name}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    電話番号：{row.phone || "-"}
                  </div>
                  <div className="text-sm text-gray-500">
                    来店回数：{row.visitCount}回
                  </div>
                  <div className="text-sm text-gray-500">
                    LTV：¥{row.ltv.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">
                    最終来店日：{formatDate(row.lastVisitDate)}
                  </div>
                  <div className="text-sm text-gray-500">
                    次回来店日：{formatDate(row.nextVisitDate)}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}