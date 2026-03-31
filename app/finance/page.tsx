"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  async function fetchData() {
    // 売上取得
    const { data: visits } = await supabase
      .from("visits")
      .select("price, visit_date");

    let salesTotal = 0;

    (visits || []).forEach((v: any) => {
      if (v.visit_date?.startsWith(selectedMonth)) {
        salesTotal += Number(v.price || 0);
      }
    });

    // 経費取得
    const { data: expensesData } = await supabase
      .from("expenses")
      .select("amount, expense_date");

    let expenseTotal = 0;

    (expensesData || []).forEach((e: any) => {
      if (e.expense_date?.startsWith(selectedMonth)) {
        expenseTotal += Number(e.amount || 0);
      }
    });

    setSales(salesTotal);
    setExpenses(expenseTotal);
  }

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

      {/* カード */}
      <div className="space-y-4">
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
      </div>
    </div>
  );
}