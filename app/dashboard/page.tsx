"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  created_at: string | null;
};

type Visit = {
  id: string;
  customer_id: string;
  visit_date: string | null;
  price: number | null;
  next_visit_date: string | null;
};

type LineFollowLog = {
  id: string;
  created_at: string | null;
};

export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [lineLogs, setLineLogs] = useState<LineFollowLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);

    const [
      { data: customersData, error: customersError },
      { data: visitsData, error: visitsError },
      { data: lineLogsData, error: lineLogsError },
    ] = await Promise.all([
      supabase.from("customers").select("id, created_at"),
      supabase
        .from("visits")
        .select("id, customer_id, visit_date, price, next_visit_date"),
      supabase.from("line_follow_logs").select("id, created_at"),
    ]);

    if (customersError) {
      console.error("customers fetch error:", customersError);
    }

    if (visitsError) {
      console.error("visits fetch error:", visitsError);
    }

    if (lineLogsError) {
      console.error("line_follow_logs fetch error:", lineLogsError);
    }

    setCustomers(customersData || []);
    setVisits(visitsData || []);
    setLineLogs(lineLogsData || []);
    setLoading(false);
  }

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  function diffDaysFromToday(dateStr: string | null) {
    if (!dateStr) return null;

    const target = new Date(dateStr);
    const baseTarget = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate()
    );

    const diffMs = today.getTime() - baseTarget.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  const stats = useMemo(() => {
    const totalSales = visits.reduce((sum, visit) => sum + (visit.price || 0), 0);

    const monthlySales = visits
      .filter((visit) => {
        if (!visit.visit_date) return false;
        const d = new Date(visit.visit_date);
        return (
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth()
        );
      })
      .reduce((sum, visit) => sum + (visit.price || 0), 0);

    const upcomingCount = visits.filter((visit) => {
      if (!visit.next_visit_date) return false;
      const d = new Date(visit.next_visit_date);
      const baseDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return baseDate.getTime() >= today.getTime();
    }).length;

    const customerLatestVisitMap = new Map<string, string | null>();

    customers.forEach((customer) => {
      const customerVisits = visits
        .filter((visit) => visit.customer_id === customer.id)
        .sort((a, b) => {
          return (
            new Date(b.visit_date || 0).getTime() -
            new Date(a.visit_date || 0).getTime()
          );
        });

      customerLatestVisitMap.set(
        customer.id,
        customerVisits.length > 0 ? customerVisits[0].visit_date : null
      );
    });

    const customerNextVisitMap = new Map<string, string | null>();

    customers.forEach((customer) => {
      const nextDates = visits
        .filter((visit) => visit.customer_id === customer.id)
        .map((visit) => visit.next_visit_date)
        .filter((date): date is string => !!date)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      customerNextVisitMap.set(customer.id, nextDates.length > 0 ? nextDates[0] : null);
    });

    const followCount = customers.filter((customer) => {
      const lastVisitDate = customerLatestVisitMap.get(customer.id) || null;
      const nextVisitDate = customerNextVisitMap.get(customer.id) || null;
      const days = diffDaysFromToday(lastVisitDate);

      return days !== null && days < 30 && !nextVisitDate;
    }).length;

    const lostCount = customers.filter((customer) => {
      const lastVisitDate = customerLatestVisitMap.get(customer.id) || null;
      const nextVisitDate = customerNextVisitMap.get(customer.id) || null;
      const days = diffDaysFromToday(lastVisitDate);

      return days !== null && days >= 30 && !nextVisitDate;
    }).length;

    return {
      totalSales,
      monthlySales,
      upcomingCount,
      followCount,
      lostCount,
      lineLogCount: lineLogs.length,
      customerCount: customers.length,
      visitCount: visits.length,
    };
  }, [customers, visits, lineLogs, today]);

  function money(value: number) {
    return `¥${value.toLocaleString()}`;
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-1">
          顧客・来店・フォロー状況の一覧
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border rounded-xl p-4 bg-white shadow-sm">
          <div className="text-sm text-gray-500">総売上</div>
          <div className="text-xl font-bold mt-1">{money(stats.totalSales)}</div>
        </div>

        <div className="border rounded-xl p-4 bg-white shadow-sm">
          <div className="text-sm text-gray-500">今月売上</div>
          <div className="text-xl font-bold mt-1">{money(stats.monthlySales)}</div>
        </div>

        <div className="border rounded-xl p-4 bg-white shadow-sm">
          <div className="text-sm text-gray-500">顧客数</div>
          <div className="text-xl font-bold mt-1">{stats.customerCount}人</div>
        </div>

        <div className="border rounded-xl p-4 bg-white shadow-sm">
          <div className="text-sm text-gray-500">来店履歴数</div>
          <div className="text-xl font-bold mt-1">{stats.visitCount}件</div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">営業・フォロー導線</h2>

        <div className="grid grid-cols-1 gap-3">
          <Link
            href="/customers?filter=upcoming"
            className="block border rounded-xl p-4 bg-white shadow-sm"
          >
            <div className="font-bold">次回来店予定</div>
            <div className="text-2xl font-bold mt-2">{stats.upcomingCount}件</div>
            <div className="text-sm text-gray-500 mt-1">
              来店予定が入っている顧客を見る
            </div>
          </Link>

          <Link
            href="/customers?filter=follow"
            className="block border rounded-xl p-4 bg-white shadow-sm"
          >
            <div className="font-bold">フォロー必要</div>
            <div className="text-2xl font-bold mt-2">{stats.followCount}人</div>
            <div className="text-sm text-gray-500 mt-1">
              直近来店あり・次回予定なしの顧客を見る
            </div>
          </Link>

          <Link
            href="/customers?filter=lost"
            className="block border rounded-xl p-4 bg-white shadow-sm"
          >
            <div className="font-bold">失客</div>
            <div className="text-2xl font-bold mt-2">{stats.lostCount}人</div>
            <div className="text-sm text-gray-500 mt-1">
              30日以上来店なし・次回予定なしの顧客を見る
            </div>
          </Link>

          <Link
            href="/line-follow-logs"
            className="block border rounded-xl p-4 bg-white shadow-sm"
          >
            <div className="font-bold">LINE送信履歴</div>
            <div className="text-2xl font-bold mt-2">{stats.lineLogCount}件</div>
            <div className="text-sm text-gray-500 mt-1">
              フォロー送信の履歴を見る
            </div>
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">基本メニュー</h2>

        <div className="grid grid-cols-1 gap-3">
          <Link
            href="/customers"
            className="block border rounded-xl p-4 bg-white shadow-sm"
          >
            <div className="font-bold">顧客一覧</div>
            <div className="text-sm text-gray-500 mt-1">
              顧客情報とLTV、来店状況を見る
            </div>
          </Link>

          <Link
            href="/customers/new"
            className="block border rounded-xl p-4 bg-white shadow-sm"
          >
            <div className="font-bold">新規顧客登録</div>
            <div className="text-sm text-gray-500 mt-1">
              顧客を新しく追加する
            </div>
          </Link>

          <Link
            href="/visits"
            className="block border rounded-xl p-4 bg-white shadow-sm"
          >
            <div className="font-bold">来店履歴一覧</div>
            <div className="text-sm text-gray-500 mt-1">
              登録済みの来店履歴を見る
            </div>
          </Link>

          <Link
            href="/visits/new"
            className="block border rounded-xl p-4 bg-white shadow-sm"
          >
            <div className="font-bold">来店履歴を追加</div>
            <div className="text-sm text-gray-500 mt-1">
              新しい来店履歴を登録する
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}