"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
};

type Visit = {
  id: string;
  customer_id: string;
  visit_date: string | null;
  next_visit_date: string | null;
  price: number | null;
};

type NoShowRow = {
  customer_id: string;
  name: string;
  phone: string;
  missed_date: string;
  days_overdue: number;
};

export default function NoShowPage() {
  const [rows, setRows] = useState<NoShowRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNoShowList();
  }, []);

  async function fetchNoShowList() {
    setLoading(true);

    try {
      const [customerRes, visitRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, phone")
          .order("created_at", { ascending: false }),
        supabase
          .from("visits")
          .select("id, customer_id, visit_date, next_visit_date, price")
          .order("visit_date", { ascending: false }),
      ]);

      if (customerRes.error) {
        console.error("customers fetch error:", customerRes.error);
      }

      if (visitRes.error) {
        console.error("visits fetch error:", visitRes.error);
      }

      const customers = (customerRes.data || []) as Customer[];
      const visits = (visitRes.data || []) as Visit[];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result: NoShowRow[] = customers
        .map((customer) => {
          const customerVisits = visits
            .filter((visit) => visit.customer_id === customer.id)
            .sort((a, b) => {
              const aTime = a.visit_date ? new Date(a.visit_date).getTime() : 0;
              const bTime = b.visit_date ? new Date(b.visit_date).getTime() : 0;
              return bTime - aTime;
            });

          if (customerVisits.length === 0) return null;

          const pastSchedules = customerVisits
            .filter((visit) => !!visit.next_visit_date)
            .map((visit) => ({
              ...visit,
              nextVisitTime: visit.next_visit_date
                ? new Date(visit.next_visit_date).getTime()
                : 0,
            }))
            .filter((visit) => !Number.isNaN(visit.nextVisitTime))
            .filter((visit) => {
              const scheduled = new Date(visit.next_visit_date as string);
              scheduled.setHours(0, 0, 0, 0);
              return scheduled.getTime() < today.getTime();
            })
            .sort((a, b) => b.nextVisitTime - a.nextVisitTime);

          if (pastSchedules.length === 0) return null;

          const missedVisit = pastSchedules.find((scheduledVisit) => {
            const scheduledTime = new Date(
              scheduledVisit.next_visit_date as string
            ).getTime();

            const hasReturnedAfterScheduled = customerVisits.some((actualVisit) => {
              if (!actualVisit.visit_date) return false;
              const actualTime = new Date(actualVisit.visit_date).getTime();
              return actualTime > scheduledTime;
            });

            return !hasReturnedAfterScheduled;
          });

          if (!missedVisit || !missedVisit.next_visit_date) return null;

          const missedDate = new Date(missedVisit.next_visit_date);
          missedDate.setHours(0, 0, 0, 0);

          const diffMs = today.getTime() - missedDate.getTime();
          const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

          return {
            customer_id: customer.id,
            name: customer.name || "顧客名なし",
            phone: customer.phone || "-",
            missed_date: missedVisit.next_visit_date,
            days_overdue: daysOverdue,
          };
        })
        .filter((item): item is NoShowRow => item !== null)
        .sort((a, b) => b.days_overdue - a.days_overdue);

      setRows(result);
    } catch (error) {
      console.error("no-show unexpected error:", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("ja-JP");
  }

  function getOverdueLabel(days: number) {
    if (days <= 0) return "本日予定";
    if (days === 1) return "1日経過";
    return `${days}日経過`;
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold">⚠️ 来店漏れ</h1>

      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-gray-500">来店漏れ人数</div>
        <div className="mt-1 text-2xl font-bold">{rows.length}人</div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-500 shadow-sm">
          来店漏れの顧客はいません
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Link
              key={`${row.customer_id}-${row.missed_date}`}
              href={`/customers/${row.customer_id}`}
              className="block rounded-2xl border bg-white p-4 shadow-sm"
            >
              <div className="text-lg font-bold">{row.name}</div>
              <div className="mt-1 text-sm text-gray-600">
                電話番号：{row.phone}
              </div>
              <div className="mt-1 text-sm text-red-600">
                予定日：{formatDate(row.missed_date)}
              </div>
              <div className="mt-1 text-sm text-red-600">
                状態：{getOverdueLabel(row.days_overdue)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}