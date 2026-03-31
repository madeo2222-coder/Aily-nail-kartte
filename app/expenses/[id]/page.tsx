"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ExpenseRow = {
  id: string;
  expense_date: string | null;
  category: string | null;
  amount: number | null;
  memo: string | null;
};

const EXPENSE_CATEGORIES = [
  "材料費",
  "消耗品費",
  "旅費交通費",
  "通信費",
  "広告宣伝費",
  "医療費",
  "外注費",
  "福利厚生費",
  "雑費",
] as const;

export default function ExpenseEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const expenseId = params?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState<string>("材料費");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!expenseId || expenseId === "[id]") {
      alert("IDが不正です");
      router.push("/expenses");
    }
  }, [expenseId, router]);

  const fetchExpense = async () => {
    if (!expenseId || expenseId === "[id]") return;

    setIsLoading(true);

    const { data, error } = await supabase
      .from("expenses")
      .select("id, expense_date, category, amount, memo")
      .eq("id", expenseId)
      .single();

    if (error || !data) {
      console.error("経費詳細取得エラー:", error);
      alert(`経費データの取得に失敗しました: ${error?.message ?? "not found"}`);
      router.push("/expenses");
      return;
    }

    const row = data as ExpenseRow;

    setExpenseDate(row.expense_date ?? "");
    setCategory(
      row.category && EXPENSE_CATEGORIES.includes(row.category as any)
        ? row.category
        : "雑費"
    );
    setAmount(String(row.amount ?? ""));
    setMemo(row.memo ?? "");
    setIsLoading(false);
  };

  useEffect(() => {
    fetchExpense();
  }, [expenseId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!expenseId || expenseId === "[id]") {
      alert("IDが不正です");
      return;
    }

    if (!expenseDate) {
      alert("日付を入力してください");
      return;
    }

    if (!category) {
      alert("カテゴリを選択してください");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      alert("金額を正しく入力してください");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase
      .from("expenses")
      .update({
        expense_date: expenseDate,
        category,
        amount: Number(amount),
        memo: memo.trim() || null,
      })
      .eq("id", expenseId);

    setIsSaving(false);

    if (error) {
      console.error("経費更新エラー:", error);
      alert(`保存に失敗しました: ${error.message}`);
      return;
    }

    alert("更新しました");
    router.push("/expenses");
  };

  const handleDelete = async () => {
    if (!expenseId || expenseId === "[id]") {
      alert("IDが不正です");
      return;
    }

    const ok = window.confirm(
      "この経費を削除しますか？\nCSV由来の確定データなら review に戻します。"
    );
    if (!ok) return;

    setIsDeleting(true);

    try {
      const res = await fetch("/api/expenses/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expenseId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "削除に失敗しました");
      }

      alert("削除しました。CSV由来データは review に戻しました。");
      router.push("/expenses");
    } catch (error) {
      console.error("経費削除エラー:", error);
      alert(error instanceof Error ? error.message : "削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="p-4 pb-24 max-w-xl mx-auto">
        <div className="rounded-2xl border p-6">読み込み中...</div>
      </main>
    );
  }

  return (
    <main className="p-4 pb-24 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">経費を編集</h1>
        <p className="text-sm text-gray-500 mt-1">
          登録済みの経費を修正できます。
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">日付</label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">カテゴリ</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 bg-white"
            required
          >
            {EXPENSE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">金額</label>
          <input
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
            placeholder="例：1200"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">メモ</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={5}
            className="w-full rounded-xl border px-3 py-2"
            placeholder="補足メモ"
          />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-xl border px-4 py-3 font-medium"
          >
            {isSaving ? "保存中..." : "保存する"}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full rounded-xl border px-4 py-3"
          >
            {isDeleting ? "削除中..." : "削除する"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/expenses")}
            className="w-full rounded-xl border px-4 py-3"
          >
            一覧に戻る
          </button>
        </div>
      </form>
    </main>
  );
}