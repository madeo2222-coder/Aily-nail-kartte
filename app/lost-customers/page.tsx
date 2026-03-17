"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  name: string | null;
};

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
};

type LostCustomerRow = {
  customerId: string;
  customerName: string;
  lastVisitDate: string | null;
  daysSinceLastVisit: number | null;
  riskLabel: string;
};

export default function LostCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "30" | "45" | "60" | "none">("all");

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);

      const [customersRes, visitsRes] = await Promise.all([
        supabase.from("customers").select("id, name").order("created_at", { ascending: false }),
        supabase.from("visits").select("id, customer_id, visit_date").order("visit_date", { ascending: false }),
      ]);

      if (customersRes.error) {
        console.error("customers fetch error:", customersRes.error.message);
      }

      if (visitsRes.error) {
        console.error("visits fetch error:", visitsRes.error.message);
      }

      setCustomers((customersRes.data as CustomerRow[]) || []);
      setVisits((visitsRes.data as VisitRow[]) || []);
      setLoading(false);
    };

    fetchAll();
  }, []);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const lostCustomers = useMemo<LostCustomerRow[]>(() => {
    const latestVisitMap: Record<string, string | null> = {};

    visits.forEach((visit) => {
      if (!visit.customer_id || !visit.visit_date) return;

      if (
        !latestVisitMap[visit.customer_id] ||
        visit.visit_date > (latestVisitMap[visit.customer_id] || "")
      ) {
        latestVisitMap[visit.customer_id] = visit.visit_date;
      }
    });

    const rows = customers.map((customer) => {
      const lastVisitDate = latestVisitMap[customer.id] || null;

      if (!lastVisitDate) {
        return {
          customerId: customer.id,
          customerName: customer.name || "顧客名未設定",
          lastVisitDate: null,
          daysSinceLastVisit: null,
          riskLabel: "来店履歴なし",
        };
      }

      const last = new Date(lastVisitDate);
      const normalizedLast = new Date(last.getFullYear(), last.getMonth(), last.getDate());
      const diffMs = today.getTime() - normalizedLast.getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let riskLabel = "30日未満";
      if (days >= 60) {
        riskLabel = "60日以上";
      } else if (days >= 45) {
        riskLabel = "45日以上";
      } else if (days >= 30) {
        riskLabel = "30日以上";
      }

      return {
        customerId: customer.id,
        customerName: customer.name || "顧客名未設定",
        lastVisitDate,
        daysSinceLastVisit: days,
        riskLabel,
      };
    });

    return rows.sort((a, b) => {
      if (a.daysSinceLastVisit === null && b.daysSinceLastVisit === null) return 0;
      if (a.daysSinceLastVisit === null) return -1;
      if (b.daysSinceLastVisit === null) return 1;
      return b.daysSinceLastVisit - a.daysSinceLastVisit;
    });
  }, [customers, visits, today]);

  const filteredCustomers = useMemo(() => {
    if (filter === "30") {
      return lostCustomers.filter(
        (row) => row.daysSinceLastVisit !== null && row.daysSinceLastVisit >= 30
      );
    }

    if (filter === "45") {
      return lostCustomers.filter(
        (row) => row.daysSinceLastVisit !== null && row.daysSinceLastVisit >= 45
      );
    }

    if (filter === "60") {
      return lostCustomers.filter(
        (row) => row.daysSinceLastVisit !== null && row.daysSinceLastVisit >= 60
      );
    }

    if (filter === "none") {
      return lostCustomers.filter((row) => row.daysSinceLastVisit === null);
    }

    return lostCustomers;
  }, [filter, lostCustomers]);

  const count30 = useMemo(() => {
    return lostCustomers.filter(
      (row) => row.daysSinceLastVisit !== null && row.daysSinceLastVisit >= 30
    ).length;
  }, [lostCustomers]);

  const count45 = useMemo(() => {
    return lostCustomers.filter(
      (row) => row.daysSinceLastVisit !== null && row.daysSinceLastVisit >= 45
    ).length;
  }, [lostCustomers]);

  const count60 = useMemo(() => {
    return lostCustomers.filter(
      (row) => row.daysSinceLastVisit !== null && row.daysSinceLastVisit >= 60
    ).length;
  }, [lostCustomers]);

  const countNoVisit = useMemo(() => {
    return lostCustomers.filter((row) => row.daysSinceLastVisit === null).length;
  }, [lostCustomers]);

  const getRiskClass = (label: string) => {
    if (label === "60日以上") return "bg-red-100 text-red-700";
    if (label === "45日以上") return "bg-orange-100 text-orange-700";
    if (label === "30日以上") return "bg-yellow-100 text-yellow-700";
    if (label === "来店履歴なし") return "bg-gray-200 text-gray-700";
    return "bg-green-100 text-green-700";
  };

  const formatDate = (value: string | null) => {
    if (!value) return "なし";
    return value;
  };

  return (
    <div
      className="mx-auto w-full max-w-[720px] p-4"
      style={{ paddingBottom: "100px" }}
      suppressHydrationWarning
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">失客予備軍</h1>
          <p className="mt-1 text-sm text-gray-500">
            最終来店日から追客対象の顧客を確認できます
          </p>
        </div>

        <Link
          href="/customers"
          className="rounded-lg border px-4 py-2 text-sm font-medium"
        >
          顧客一覧へ
        </Link>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">
          読み込み中...
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setFilter("30")}
              className="rounded-2xl border bg-white p-4 text-left shadow-sm"
              suppressHydrationWarning
            >
              <p className="text-sm text-gray-500">30日以上</p>
              <p className="mt-1 text-2xl font-bold">{count30}人</p>
            </button>

            <button
              type="button"
              onClick={() => setFilter("45")}
              className="rounded-2xl border bg-white p-4 text-left shadow-sm"
              suppressHydrationWarning
            >
              <p className="text-sm text-gray-500">45日以上</p>
              <p className="mt-1 text-2xl font-bold">{count45}人</p>
            </button>

            <button
              type="button"
              onClick={() => setFilter("60")}
              className="rounded-2xl border bg-white p-4 text-left shadow-sm"
              suppressHydrationWarning
            >
              <p className="text-sm text-gray-500">60日以上</p>
              <p className="mt-1 text-2xl font-bold">{count60}人</p>
            </button>

            <button
              type="button"
              onClick={() => setFilter("none")}
              className="rounded-2xl border bg-white p-4 text-left shadow-sm"
              suppressHydrationWarning
            >
              <p className="text-sm text-gray-500">来店履歴なし</p>
              <p className="mt-1 text-2xl font-bold">{countNoVisit}人</p>
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                filter === "all" ? "bg-black text-white" : "bg-gray-100 text-gray-700"
              }`}
              suppressHydrationWarning
            >
              すべて
            </button>

            <button
              type="button"
              onClick={() => setFilter("30")}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                filter === "30" ? "bg-black text-white" : "bg-gray-100 text-gray-700"
              }`}
              suppressHydrationWarning
            >
              30日以上
            </button>

            <button
              type="button"
              onClick={() => setFilter("45")}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                filter === "45" ? "bg-black text-white" : "bg-gray-100 text-gray-700"
              }`}
              suppressHydrationWarning
            >
              45日以上
            </button>

            <button
              type="button"
              onClick={() => setFilter("60")}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                filter === "60" ? "bg-black text-white" : "bg-gray-100 text-gray-700"
              }`}
              suppressHydrationWarning
            >
              60日以上
            </button>

            <button
              type="button"
              onClick={() => setFilter("none")}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                filter === "none" ? "bg-black text-white" : "bg-gray-100 text-gray-700"
              }`}
              suppressHydrationWarning
            >
              来店履歴なし
            </button>
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="rounded-xl border bg-white p-5 text-center text-sm text-gray-500">
              条件に合う顧客はいません
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.customerId}
                  className="rounded-2xl border bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{customer.customerName}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        最終来店日：{formatDate(customer.lastVisitDate)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${getRiskClass(
                        customer.riskLabel
                      )}`}
                    >
                      {customer.riskLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-sm text-gray-700 sm:grid-cols-2">
                    <div>
                      <span className="font-medium">経過日数：</span>
                      <span>
                        {customer.daysSinceLastVisit === null
                          ? "来店履歴なし"
                          : `${customer.daysSinceLastVisit}日`}
                      </span>
                    </div>

                    <div>
                      <span className="font-medium">追客優先度：</span>
                      <span>
                        {customer.riskLabel === "60日以上"
                          ? "高"
                          : customer.riskLabel === "45日以上"
                          ? "中"
                          : customer.riskLabel === "30日以上"
                          ? "低"
                          : customer.riskLabel === "来店履歴なし"
                          ? "初回誘導"
                          : "通常"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}