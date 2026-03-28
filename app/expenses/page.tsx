"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Expense = {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  memo: string | null;
  receipt_url: string | null;
  created_at: string | null;
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  useEffect(() => {
    fetchExpenses();
  }, []);

  async function fetchExpenses() {
    setLoading(true);

    const { data, error } = await supabase
      .from("expenses")
      .select("id, expense_date, category, amount, memo, receipt_url, created_at")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("経費一覧取得エラー:", error);
      alert("経費一覧の取得に失敗しました");
      setLoading(false);
      return;
    }

    setExpenses(data || []);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("この経費を削除しますか？");
    if (!ok) return;

    const { error } = await supabase.from("expenses").delete().eq("id", id);

    if (error) {
      console.error("経費削除エラー:", error);
      alert("削除に失敗しました");
      return;
    }

    alert("削除しました");
    fetchExpenses();
  }

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => item.expense_date?.slice(0, 7) === selectedMonth);
  }, [expenses, selectedMonth]);

  const totalAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [filteredExpenses]);

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">経費一覧</h1>
        <Link
          href="/expenses/new"
          className="rounded-xl bg-black px-4 py-2 text-sm text-white"
        >
          ＋ 経費登録
        </Link>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          対象月
        </label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="w-full rounded-xl border px-3 py-3 text-sm"
        />

        <div className="mt-4 rounded-xl bg-gray-50 p-3">
          <p className="text-sm text-gray-600">当月経費合計</p>
          <p className="mt-1 text-xl font-bold">¥{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : filteredExpenses.length === 0 ? (
          <p className="text-sm text-gray-500">この月の経費はまだありません</p>
        ) : (
          <div className="space-y-3">
            {filteredExpenses.map((item) => (
              <div key={item.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="font-semibold">日付:</span> {item.expense_date}
                    </p>
                    <p className="text-sm">
                      <span className="font-semibold">勘定科目:</span> {item.category}
                    </p>
                    <p className="text-sm">
                      <span className="font-semibold">金額:</span> ¥
                      {Number(item.amount || 0).toLocaleString()}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      <span className="font-semibold">メモ:</span> {item.memo || "-"}
                    </p>
                  </div>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs text-white"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}