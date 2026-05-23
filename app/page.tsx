"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
};

type Visit = {
  id: string;
  customer_id: string;
  visit_date?: string | null;
  price?: number | null;
};

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getNextMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function toDateOnlyString(date: Date) {
  return date.toISOString().split("T")[0];
}

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export default function HomePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: customersData } = await supabase
      .from("customers")
      .select("id");

    const { data: visitsData } = await supabase
      .from("visits")
      .select("id, customer_id, visit_date, price");

    setCustomers(customersData || []);
    setVisits(visitsData || []);
    setLoading(false);
  }

  const today = toDateOnlyString(new Date());

  const todaySales = visits.reduce((sum, visit) => {
    if (visit.visit_date === today) {
      return sum + (visit.price || 0);
    }

    return sum;
  }, 0);

  const todayCount = visits.filter((visit) => visit.visit_date === today).length;

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const start = getMonthStart(now);
    const end = getNextMonthStart(now);

    const monthlyVisits = visits.filter((visit) => {
      if (!visit.visit_date) return false;

      const visitDate = new Date(visit.visit_date);

      if (Number.isNaN(visitDate.getTime())) return false;

      return visitDate >= start && visitDate < end;
    });

    const monthlySales = monthlyVisits.reduce((sum, visit) => {
      return sum + (visit.price || 0);
    }, 0);

    const monthlyCustomerIds = Array.from(
      new Set(
        monthlyVisits
          .map((visit) => visit.customer_id)
          .filter((customerId) => Boolean(customerId))
      )
    );

    const repeatCustomerIds = monthlyCustomerIds.filter((customerId) => {
      return visits.some((visit) => {
        if (visit.customer_id !== customerId) return false;
        if (!visit.visit_date) return false;

        const visitDate = new Date(visit.visit_date);

        if (Number.isNaN(visitDate.getTime())) return false;

        return visitDate < start;
      });
    });

    const repeatRate =
      monthlyCustomerIds.length > 0
        ? (repeatCustomerIds.length / monthlyCustomerIds.length) * 100
        : 0;

    return {
      monthlySales,
      monthlyVisitCount: monthlyVisits.length,
      monthlyCustomerCount: monthlyCustomerIds.length,
      repeatCustomerCount: repeatCustomerIds.length,
      repeatRate,
    };
  }, [visits]);

  const totalSales = visits.reduce((sum, visit) => {
    return sum + (visit.price || 0);
  }, 0);

  if (loading) {
    return (
      <div className="p-4">
        <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow">
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ダッシュボード</h1>

        <Link
          href="/visits/new"
          className="rounded-lg bg-black px-4 py-2 text-white"
        >
          来店登録
        </Link>
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <p className="text-sm text-slate-600">今日の売上</p>
        <p className="mt-1 text-3xl font-bold">{formatYen(todaySales)}</p>
        <p className="mt-2 text-sm text-slate-600">来店数: {todayCount}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-slate-600">今月の売上</p>
          <p className="mt-1 text-3xl font-bold">
            {formatYen(monthlyStats.monthlySales)}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            今月来店数: {monthlyStats.monthlyVisitCount}件
          </p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-slate-600">今月リピート率</p>
          <p className="mt-1 text-3xl font-bold text-rose-600">
            {monthlyStats.repeatRate.toFixed(1)}%
          </p>
          <p className="mt-2 text-sm text-slate-600">
            今月来店 {monthlyStats.monthlyCustomerCount}人 / リピート{" "}
            {monthlyStats.repeatCustomerCount}人
          </p>
          <p className="mt-1 text-xs text-slate-400">
            今月来店したお客様のうち、過去にも来店履歴がある割合です。
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <p className="text-sm text-slate-600">累計売上</p>
        <p className="mt-1 text-3xl font-bold">{formatYen(totalSales)}</p>
        <p className="mt-2 text-sm text-slate-600">
          顧客数: {customers.length}人
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Link
          href="/customers"
          className="rounded-xl bg-white p-4 text-center font-semibold shadow"
        >
          👤 顧客
        </Link>

        <Link
          href="/visits"
          className="rounded-xl bg-white p-4 text-center font-semibold shadow"
        >
          💅 来店
        </Link>

        <Link
          href="/reports/daily"
          className="rounded-xl bg-white p-4 text-center font-semibold shadow"
        >
          📊 日別売上
        </Link>
      </div>
    </div>
  );
}