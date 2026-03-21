"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Visit = Record<string, any>;

export default function DashboardPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [customersCount, setCustomersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);

    const [visitsRes, customersRes] = await Promise.all([
      supabase.from("visits").select("*").order("visit_date", { ascending: false }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
    ]);

    if (visitsRes.error) {
      console.error("visits fetch error:", visitsRes.error);
    }

    if (customersRes.error) {
      console.error("customers fetch error:", customersRes.error);
    }

    setVisits(visitsRes.data || []);
    setCustomersCount(customersRes.count || 0);
    setLoading(false);
  }

  const todayString = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  function toNumber(value: any) {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? num : 0;
  }

  function getVisitDate(visit: Visit) {
    const raw =
      visit.visit_date ??
      visit.date ??
      visit.visited_at ??
      visit.created_at ??
      null;

    if (!raw) return "";
    return String(raw).slice(0, 10);
  }

  function getSaleAmount(visit: Visit) {
    return (
      toNumber(visit.total_amount) ||
      toNumber(visit.amount) ||
      toNumber(visit.sales_amount) ||
      toNumber(visit.sale_amount) ||
      toNumber(visit.price) ||
      toNumber(visit.menu_price) ||
      toNumber(visit.total) ||
      0
    );
  }

  function getPaymentStatus(visit: Visit) {
    return String(
      visit.payment_status ??
        visit.status ??
        visit.payment ??
        ""
    ).toLowerCase();
  }

  function getUnpaidAmount(visit: Visit) {
    const status = getPaymentStatus(visit);

    if (status === "paid") {
      return 0;
    }

    const explicit =
      toNumber(visit.unpaid_amount) ||
      toNumber(visit.receivable_amount) ||
      toNumber(visit.remaining_amount) ||
      toNumber(visit.balance_due) ||
      0;

    if (status === "unpaid" || status === "partial") {
      if (explicit > 0) return explicit;

      const sale = getSaleAmount(visit);
      const paid =
        toNumber(visit.paid_amount) ||
        toNumber(visit.deposit_amount) ||
        toNumber(visit.received_amount) ||
        0;

      const diff = sale - paid;
      return diff > 0 ? diff : 0;
    }

    return explicit > 0 ? explicit : 0;
  }

  const stats = useMemo(() => {
    const totalVisits = visits.length;

    const totalSales = visits.reduce((sum, visit) => {
      return sum + getSaleAmount(visit);
    }, 0);

    const unpaidVisits = visits.filter((visit) => getUnpaidAmount(visit) > 0);

    const totalReceivables = unpaidVisits.reduce((sum, visit) => {
      return sum + getUnpaidAmount(visit);
    }, 0);

    const todayVisits = visits.filter((visit) => getVisitDate(visit) === todayString);

    const todaySales = todayVisits.reduce((sum, visit) => {
      return sum + getSaleAmount(visit);
    }, 0);

    return {
      totalVisits,
      totalSales,
      unpaidCount: unpaidVisits.length,
      totalReceivables,
      todaySales,
    };
  }, [visits, todayString]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">ダッシュボード</h1>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
            読み込み中...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-500">顧客数</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{customersCount}人</p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-500">来店数</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{stats.totalVisits}件</p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-500">総売上</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {stats.totalSales.toLocaleString()}円
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-500">今日の売上</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {stats.todaySales.toLocaleString()}円
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-orange-700">未収管理</p>
                  <p className="mt-2 text-2xl font-bold text-orange-600">
                    {stats.totalReceivables.toLocaleString()}円
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    未収件数：{stats.unpaidCount}件
                  </p>
                </div>

                <Link
                  href="/receivables"
                  className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
                >
                  一覧へ
                </Link>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <Link
                href="/visits"
                className="block rounded-2xl border border-gray-200 bg-white p-4 text-center text-sm font-semibold text-gray-900 shadow-sm"
              >
                来店一覧を見る
              </Link>

              <Link
                href="/customers"
                className="block rounded-2xl border border-gray-200 bg-white p-4 text-center text-sm font-semibold text-gray-900 shadow-sm"
              >
                顧客一覧を見る
              </Link>

              <Link
                href="/receivables"
                className="block rounded-2xl border border-gray-200 bg-white p-4 text-center text-sm font-semibold text-gray-900 shadow-sm"
              >
                未収一覧を見る
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}