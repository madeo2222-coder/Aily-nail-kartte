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

function toDateOnlyString(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthStartText(date: Date) {
  return toDateOnlyString(new Date(date.getFullYear(), date.getMonth(), 1));
}

function getPreviousMonthStartText(date: Date) {
  return toDateOnlyString(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

function getPreviousMonthSameDayText(date: Date) {
  const currentDay = date.getDate();
  const previousMonthLastDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    0
  ).getDate();

  const targetDay = Math.min(currentDay, previousMonthLastDay);

  return toDateOnlyString(
    new Date(date.getFullYear(), date.getMonth() - 1, targetDay)
  );
}

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatDiffYen(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${prefix}${formatYen(Math.abs(value))}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "±0.0%";
  const prefix = value > 0 ? "+" : value < 0 ? "" : "±";
  return `${prefix}${value.toFixed(1)}%`;
}

function isDateInRange(dateText: string | null | undefined, start: string, end: string) {
  if (!dateText) return false;
  const normalized = dateText.slice(0, 10);
  return normalized >= start && normalized <= end;
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

    const currentMonthStart = getMonthStartText(now);
    const currentSameDayEnd = toDateOnlyString(now);

    const previousMonthStart = getPreviousMonthStartText(now);
    const previousMonthSameDayEnd = getPreviousMonthSameDayText(now);

    const currentMonthToDateVisits = visits.filter((visit) =>
      isDateInRange(visit.visit_date, currentMonthStart, currentSameDayEnd)
    );

    const previousMonthSameDayVisits = visits.filter((visit) =>
      isDateInRange(visit.visit_date, previousMonthStart, previousMonthSameDayEnd)
    );

    const monthlySales = currentMonthToDateVisits.reduce((sum, visit) => {
      return sum + (visit.price || 0);
    }, 0);

    const previousSameDaySales = previousMonthSameDayVisits.reduce(
      (sum, visit) => {
        return sum + (visit.price || 0);
      },
      0
    );

    const salesDiff = monthlySales - previousSameDaySales;

    const salesDiffRate =
      previousSameDaySales > 0
        ? (salesDiff / previousSameDaySales) * 100
        : monthlySales > 0
        ? 100
        : 0;

    const monthlyCustomerIds = Array.from(
      new Set(
        currentMonthToDateVisits
          .map((visit) => visit.customer_id)
          .filter((customerId) => Boolean(customerId))
      )
    );

    const repeatCustomerIds = monthlyCustomerIds.filter((customerId) => {
      return visits.some((visit) => {
        if (visit.customer_id !== customerId) return false;
        if (!visit.visit_date) return false;

        return visit.visit_date.slice(0, 10) < currentMonthStart;
      });
    });

    const repeatRate =
      monthlyCustomerIds.length > 0
        ? (repeatCustomerIds.length / monthlyCustomerIds.length) * 100
        : 0;

    return {
      monthlySales,
      previousSameDaySales,
      salesDiff,
      salesDiffRate,
      currentMonthStart,
      currentSameDayEnd,
      previousMonthStart,
      previousMonthSameDayEnd,
      monthlyVisitCount: currentMonthToDateVisits.length,
      previousSameDayVisitCount: previousMonthSameDayVisits.length,
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

          <div className="mt-3 rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">前月同日比</p>
            <p
              className={`mt-1 text-lg font-black ${
                monthlyStats.salesDiff >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatPercent(monthlyStats.salesDiffRate)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              差額: {formatDiffYen(monthlyStats.salesDiff)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              今月 {monthlyStats.currentMonthStart}〜
              {monthlyStats.currentSameDayEnd} / 前月{" "}
              {monthlyStats.previousMonthStart}〜
              {monthlyStats.previousMonthSameDayEnd}
            </p>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            今月来店数: {monthlyStats.monthlyVisitCount}件
          </p>
          <p className="mt-1 text-xs text-slate-400">
            前月同日来店数: {monthlyStats.previousSameDayVisitCount}件
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