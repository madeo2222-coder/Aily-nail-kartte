"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  name: string | null;
};

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  amount: number | null;
  customers?:
    | {
        id: string;
        name: string | null;
      }
    | {
        id: string;
        name: string | null;
      }[]
    | null;
};

type CustomerKpiRow = {
  customerId: string;
  customerName: string;
  visitCount: number;
  totalAmount: number;
  averageAmount: number;
  lastVisitDate: string | null;
};

export default function KpiReportsPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);

      const [customersRes, visitsRes] = await Promise.all([
        supabase.from("customers").select("id, name"),
        supabase
          .from("visits")
          .select(
            `
            id,
            customer_id,
            visit_date,
            amount,
            customers (
              id,
              name
            )
          `
          )
          .order("visit_date", { ascending: false }),
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

  const customerKpis = useMemo<CustomerKpiRow[]>(() => {
    const map: Record<
      string,
      {
        customerName: string;
        visitCount: number;
        totalAmount: number;
        lastVisitDate: string | null;
      }
    > = {};

    visits.forEach((visit) => {
      if (!visit.customer_id) return;

      const customerName = Array.isArray(visit.customers)
        ? visit.customers[0]?.name || "顧客名未設定"
        : visit.customers?.name || "顧客名未設定";

      if (!map[visit.customer_id]) {
        map[visit.customer_id] = {
          customerName,
          visitCount: 0,
          totalAmount: 0,
          lastVisitDate: null,
        };
      }

      map[visit.customer_id].visitCount += 1;
      map[visit.customer_id].totalAmount += visit.amount || 0;

      if (
        visit.visit_date &&
        (!map[visit.customer_id].lastVisitDate ||
          visit.visit_date > (map[visit.customer_id].lastVisitDate || ""))
      ) {
        map[visit.customer_id].lastVisitDate = visit.visit_date;
      }
    });

    return Object.entries(map)
      .map(([customerId, value]) => ({
        customerId,
        customerName: value.customerName,
        visitCount: value.visitCount,
        totalAmount: value.totalAmount,
        averageAmount:
          value.visitCount > 0
            ? Math.round(value.totalAmount / value.visitCount)
            : 0,
        lastVisitDate: value.lastVisitDate,
      }))
      .sort((a, b) => b.visitCount - a.visitCount);
  }, [visits]);

  const totalCustomers = customers.length;
  const totalVisits = visits.length;

  const totalSales = useMemo(() => {
    return visits.reduce((sum, row) => sum + (row.amount || 0), 0);
  }, [visits]);

  const averageUnitPrice = useMemo(() => {
    if (totalVisits === 0) return 0;
    return Math.round(totalSales / totalVisits);
  }, [totalSales, totalVisits]);

  const averageVisitPerCustomer = useMemo(() => {
    if (totalCustomers === 0) return 0;
    return Math.round((totalVisits / totalCustomers) * 10) / 10;
  }, [totalVisits, totalCustomers]);

  const repeatCustomersCount = useMemo(() => {
    return customerKpis.filter((row) => row.visitCount >= 2).length;
  }, [customerKpis]);

  const repeatRate = useMemo(() => {
    if (totalCustomers === 0) return 0;
    return Math.round((repeatCustomersCount / totalCustomers) * 1000) / 10;
  }, [repeatCustomersCount, totalCustomers]);

  const formatAmount = (value: number) => {
    return `¥${value.toLocaleString()}`;
  };

  const formatDate = (value: string | null) => {
    if (!value) return "未設定";
    return value;
  };

  return (
    <div
      className="mx-auto w-full max-w-[720px] p-4"
      style={{ paddingBottom: "100px" }}
      suppressHydrationWarning
    >
      <div className="mb-5">
        <h1 className="text-2xl font-bold">KPIレポート</h1>
        <p className="mt-1 text-sm text-gray-500">
          顧客・来店・売上の重要指標を確認できます
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">
          読み込み中...
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">総顧客数</p>
              <p className="mt-1 text-2xl font-bold">
                {totalCustomers.toLocaleString()}人
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">総来店数</p>
              <p className="mt-1 text-2xl font-bold">
                {totalVisits.toLocaleString()}件
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">総売上</p>
              <p className="mt-1 text-2xl font-bold">
                {formatAmount(totalSales)}
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">平均客単価</p>
              <p className="mt-1 text-2xl font-bold">
                {formatAmount(averageUnitPrice)}
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">平均来店回数</p>
              <p className="mt-1 text-2xl font-bold">
                {averageVisitPerCustomer.toLocaleString()}回
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">リピート率</p>
              <p className="mt-1 text-2xl font-bold">
                {repeatRate.toLocaleString()}%
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-gray-500">リピート顧客数</p>
                <p className="mt-1 text-lg font-semibold">
                  {repeatCustomersCount.toLocaleString()}人
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">初回来店のみ顧客</p>
                <p className="mt-1 text-lg font-semibold">
                  {(totalCustomers - repeatCustomersCount).toLocaleString()}人
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">来店あり顧客数</p>
                <p className="mt-1 text-lg font-semibold">
                  {customerKpis.length.toLocaleString()}人
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-bold">顧客別来店ランキング</h2>

            {customerKpis.length === 0 ? (
              <div className="rounded-xl border bg-white p-5 text-center text-sm text-gray-500">
                集計できる来店データがまだありません
              </div>
            ) : (
              <div className="space-y-3">
                {customerKpis.map((row, index) => (
                  <div
                    key={row.customerId}
                    className="rounded-2xl border bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-gray-500">#{index + 1}</p>
                        <p className="text-base font-semibold">
                          {row.customerName}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm text-gray-500">来店回数</p>
                        <p className="text-lg font-bold">
                          {row.visitCount.toLocaleString()}回
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 text-sm text-gray-700 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-gray-500">累計売上</p>
                        <p className="mt-1 font-medium">
                          {formatAmount(row.totalAmount)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">平均客単価</p>
                        <p className="mt-1 font-medium">
                          {formatAmount(row.averageAmount)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">最終来店日</p>
                        <p className="mt-1 font-medium">
                          {formatDate(row.lastVisitDate)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}