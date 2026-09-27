"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type VisitAmountRow = {
  price?: number | string | null;
  visit_date?: string | null;
};

type ExpenseAmountRow = {
  amount?: number | string | null;
  expense_date?: string | null;
};

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function FinancePage() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [sales, setSales] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);

    try {
      const [visitsResult, expensesResult] = await Promise.all([
        supabase.from("visits").select("price, visit_date"),
        supabase.from("expenses").select("amount, expense_date"),
      ]);

      if (visitsResult.error || expensesResult.error) {
        throw visitsResult.error ?? expensesResult.error;
      }

      let salesTotal = 0;

      (visitsResult.data as VisitAmountRow[] | null)?.forEach((visit) => {
        if (visit.visit_date?.startsWith(selectedMonth)) {
          salesTotal += Number(visit.price || 0);
        }
      });

      let expenseTotal = 0;

      (expensesResult.data as ExpenseAmountRow[] | null)?.forEach((expense) => {
        if (expense.expense_date?.startsWith(selectedMonth)) {
          expenseTotal += Number(expense.amount || 0);
        }
      });

      setSales(salesTotal);
      setExpenses(expenseTotal);
    } catch (error) {
      console.error("収支取得エラー:", error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const profit = sales - expenses;
  const profitRate = sales > 0 ? (profit / sales) * 100 : 0;

  return (
    <div className="p-4 pb-24">
      <h1 className="text-2xl font-bold mb-4">収支管理</h1>

      {/* 月選択 */}
      <div className="mb-6">
        <label className="text-sm text-gray-500">対象月</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="mt-1 w-full border rounded-lg p-2"
        />
      </div>

      {isLoading && (
        <div className="rounded-xl border p-4 text-sm text-gray-500">集計中...</div>
      )}

      {!isLoading && loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="font-bold text-red-900">収支データを取得できませんでした</p>
          <p className="mt-1 text-sm text-red-800">
            売上・経費を0円として表示せず、集計を停止しています。
          </p>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-900"
          >
            再試行
          </button>
        </div>
      )}

      {/* カード */}
      {!isLoading && !loadError && <div className="space-y-4">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">売上</p>
          <p className="text-2xl font-bold">{formatYen(sales)}</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">経費</p>
          <p className="text-2xl font-bold">{formatYen(expenses)}</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">利益</p>
          <p
            className={`text-3xl font-bold ${
              profit < 0 ? "text-red-500" : "text-orange-500"
            }`}
          >
            {formatYen(profit)}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            利益率 {formatPercent(profitRate)}
          </p>
        </div>
      </div>}
    </div>
  );
}
