"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

export default function NewExpensePage() {
  const router = useRouter();

  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [category, setCategory] = useState<string>("材料費");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

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

    const { error } = await supabase.from("expenses").insert([
      {
        expense_date: expenseDate,
        category,
        amount: Number(amount),
        memo: memo.trim() || null,
      },
    ]);

    setIsSaving(false);

    if (error) {
      console.error("経費登録エラー:", error);
      alert(`保存に失敗しました: ${error.message}`);
      return;
    }

    alert("登録しました");
    router.push("/expenses");
  };

  return (
    <main className="p-4 pb-24 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">経費を新規登録</h1>
        <p className="text-sm text-gray-500 mt-1">
          経費を手入力で登録できます。
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