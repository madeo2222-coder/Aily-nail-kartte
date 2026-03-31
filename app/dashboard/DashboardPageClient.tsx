"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type VisitRow = {
  price: number | null;
  visit_date: string | null;
  customer_id: string | null;
  next_visit_date: string | null;
};

type CustomerSummary = {
  id: string;
  name: string;
};

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
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
  if (Number.isNaN(target.getTime())) return null;

  const baseTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );

  const diffMs = baseToday.getTime() - baseTarget.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default function DashboardPageClient() {
  const [customersCount, setCustomersCount] = useState(0);
  const [visitsCount, setVisitsCount] = useState(0);
  const [monthSales, setMonthSales] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [monthExpenses, setMonthExpenses] = useState(0);

  const [nextCustomers, setNextCustomers] = useState<CustomerSummary[]>([]);
  const [followCustomers, setFollowCustomers] = useState<CustomerSummary[]>([]);
  const [lostCustomers, setLostCustomers] = useState<CustomerSummary[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    const { count: customers } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true });

    const { count: visits } = await supabase
      .from("visits")
      .select("*", { count: "exact", head: true });

    const { data: visitRows } = await supabase
      .from("visits")
      .select("price, visit_date, customer_id, next_visit_date")
      .order("visit_date", { ascending: false });

    const { data: expenseRows } = await supabase
      .from("expenses")
      .select("amount, expense_date");

    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;

    let monthlyTotal = 0;
    let allTimeTotal = 0;
    let monthlyExpenseTotal = 0;

    const customerVisitMap: Record<
      string,
      {
        lastVisitDate: string | null;
        nextVisitDate: string | null;
      }
    > = {};

    (visitRows as VisitRow[] | null)?.forEach((row) => {
      const price = Number(row.price ?? 0);
      const visitDate = row.visit_date ?? "";

      allTimeTotal += price;

      if (visitDate.startsWith(monthPrefix)) {
        monthlyTotal += price;
      }

      if (!row.customer_id) return;

      const existing = customerVisitMap[row.customer_id];

      if (!existing) {
        customerVisitMap[row.customer_id] = {
          lastVisitDate: row.visit_date ?? null,
          nextVisitDate: row.next_visit_date ?? null,
        };
        return;
      }

      const existingLast = existing.lastVisitDate
        ? new Date(existing.lastVisitDate).getTime()
        : 0;
      const currentLast = row.visit_date ? new Date(row.visit_date).getTime() : 0;

      if (currentLast > existingLast) {
        customerVisitMap[row.customer_id] = {
          lastVisitDate: row.visit_date ?? null,
          nextVisitDate: row.next_visit_date ?? null,
        };
      } else if (!existing.nextVisitDate && row.next_visit_date) {
        customerVisitMap[row.customer_id] = {
          ...existing,
          nextVisitDate: row.next_visit_date,
        };
      }
    });

    (expenseRows || []).forEach((row: any) => {
      const amount = Number(row.amount ?? 0);
      const date = row.expense_date ?? "";

      if (date.startsWith(monthPrefix)) {
        monthlyExpenseTotal += amount;
      }
    });

    const nextIds: string[] = [];
    const followIds: string[] = [];
    const lostIds: string[] = [];

    Object.entries(customerVisitMap).forEach(([customerId, info]) => {
      if (info.nextVisitDate) {
        nextIds.push(customerId);
        return;
      }

      const days = diffDaysFromToday(info.lastVisitDate);

      if (days === null) return;

      if (days < 30) {
        followIds.push(customerId);
      } else {
        lostIds.push(customerId);
      }
    });

    const fetchCustomers = async (ids: string[]) => {
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", ids);

      return (data || []).map((item) => ({
        id: item.id,
        name: item.name || "名前未設定",
      }));
    };

    setCustomersCount(customers || 0);
    setVisitsCount(visits || 0);
    setMonthSales(monthlyTotal);
    setTotalSales(allTimeTotal);
    setMonthExpenses(monthlyExpenseTotal);

    setNextCustomers(await fetchCustomers(nextIds));
    setFollowCustomers(await fetchCustomers(followIds));
    setLostCustomers(await fetchCustomers(lostIds));
  }

  const profit = monthSales - monthExpenses;
  const profitRate = monthSales > 0 ? (profit / monthSales) * 100 : 0;
  const isProfitNegative = profit < 0;

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-2 text-2xl font-bold">ダッシュボード</h1>
      <p className="mb-6 text-sm text-gray-500">
        顧客・来店・フォロー状況の一覧
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">総売上</p>
          <p className="mt-3 text-2xl font-bold">{formatYen(totalSales)}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">今月売上</p>
          <p className="mt-3 text-2xl font-bold">{formatYen(monthSales)}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">今月経費</p>
          <p className="mt-3 text-2xl font-bold">{formatYen(monthExpenses)}</p>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            isProfitNegative ? "bg-red-50" : "bg-orange-50"
          }`}
        >
          <p className="text-sm text-gray-500">今月利益</p>
          <p
            className={`mt-3 text-3xl font-bold ${
              isProfitNegative ? "text-red-500" : "text-orange-500"
            }`}
          >
            {formatYen(profit)}
          </p>
          <p className="mt-2 text-sm font-medium text-gray-600">
            利益率 {formatPercent(profitRate)}
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">顧客数</p>
          <p className="mt-3 text-2xl font-bold">{customersCount}人</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">来店履歴数</p>
          <p className="mt-3 text-2xl font-bold">{visitsCount}件</p>
        </div>
      </div>

      <h2 className="mb-4 mt-8 text-2xl font-bold">営業・フォロー導線</h2>

      <div className="space-y-4">
        <Link href="/customers?type=next" className="block">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-2xl font-bold">次回来店予定</p>
            <p className="mt-4 text-4xl font-bold">{nextCustomers.length}件</p>
            <p className="mt-3 text-sm text-gray-500">
              次回来店日が登録されている顧客を見る
            </p>
          </div>
        </Link>

        <Link href="/customers?type=follow" className="block">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-2xl font-bold">フォロー必要</p>
            <p className="mt-4 text-4xl font-bold">{followCustomers.length}人</p>
            <p className="mt-3 text-sm text-gray-500">
              30日未満・次回来店未登録の顧客を見る
            </p>
          </div>
        </Link>

        <Link href="/customers?type=lost" className="block">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-2xl font-bold">失客</p>
            <p className="mt-4 text-4xl font-bold">{lostCustomers.length}人</p>
            <p className="mt-3 text-sm text-gray-500">
              30日以上・次回来店未登録の顧客を見る
            </p>
          </div>
        </Link>
      </div>

      <h2 className="mb-4 mt-8 text-2xl font-bold">基本メニュー</h2>

      <div className="space-y-4">
        <Link href="/customers" className="block">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-2xl font-bold">顧客一覧</p>
            <p className="mt-3 text-sm text-gray-500">
              顧客情報とLTV、来店状況を見る
            </p>
          </div>
        </Link>

        <Link href="/customers/new" className="block">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-2xl font-bold">新規顧客登録</p>
            <p className="mt-3 text-sm text-gray-500">
              顧客を新しく追加する
            </p>
          </div>
        </Link>

        <Link href="/visits" className="block">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-2xl font-bold">来店履歴一覧</p>
            <p className="mt-3 text-sm text-gray-500">
              登録済みの来店履歴を見る
            </p>
          </div>
        </Link>

        <Link href="/visits/new" className="block">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-2xl font-bold">来店履歴を追加</p>
            <p className="mt-3 text-sm text-gray-500">
              新しい来店履歴を登録する
            </p>
          </div>
        </Link>

        <Link href="/sales-dashboard" className="block">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-2xl font-bold">売上ダッシュボード</p>
            <p className="mt-3 text-sm text-gray-500">
              今日・今月の売上と来店状況を見る
            </p>
          </div>
        </Link>
      </div>

      <h2 className="mb-4 mt-10 text-xl font-bold">対象顧客一覧</h2>

      <div className="space-y-6">
        <div>
          <p className="mb-2 text-lg font-bold">次回来店予定</p>
          {nextCustomers.length === 0 ? (
            <p className="text-sm text-gray-500">対象なし</p>
          ) : (
            <div className="space-y-2">
              {nextCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex justify-between rounded-xl border p-3"
                >
                  <span>{customer.name}</span>
                  <span className="text-sm text-blue-500">予約あり</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-lg font-bold">フォロー必要</p>
          {followCustomers.length === 0 ? (
            <p className="text-sm text-gray-500">対象なし</p>
          ) : (
            <div className="space-y-2">
              {followCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex justify-between rounded-xl border p-3"
                >
                  <span>{customer.name}</span>
                  <span className="text-sm text-orange-500">30日未満</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-lg font-bold">失客</p>
          {lostCustomers.length === 0 ? (
            <p className="text-sm text-gray-500">対象なし</p>
          ) : (
            <div className="space-y-2">
              {lostCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex justify-between rounded-xl border p-3"
                >
                  <span>{customer.name}</span>
                  <span className="text-sm text-red-500">30日以上</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}