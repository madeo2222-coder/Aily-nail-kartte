"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const CATEGORY_OPTIONS = [
  "材料費",
  "家賃",
  "光熱費",
  "通信費",
  "人件費",
  "広告宣伝費",
  "消耗品費",
  "外注費",
  "雑費",
];

export default function NewExpensePage() {
  const router = useRouter();

  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [category, setCategory] = useState("材料費");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!expenseDate) {
      alert("日付を入力してください");
      return;
    }

    if (!category) {
      alert("勘定科目を選択してください");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      alert("金額を正しく入力してください");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("expenses").insert([
      {
        expense_date: expenseDate,
        category,
        amount: Number(amount),
        memo: memo || null,
        receipt_url: receiptUrl || null,
      },
    ]);

    setSaving(false);

    if (error) {
      console.error("経費登録エラー:", error);
      alert("経費の登録に失敗しました");
      return;
    }

    alert("経費を登録しました");
    router.push("/expenses");
  }

  return (
    <div className="p-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/expenses" className="text-sm text-gray-600 underline">
          ← 経費一覧に戻る
        </Link>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="mb-4 text-xl font-bold">経費登録</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              日付
            </label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-3 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              勘定科目
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border px-3 py-3 text-sm"
            >
              {CATEGORY_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              金額
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例: 12000"
              className="w-full rounded-xl border px-3 py-3 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              メモ
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              placeholder="例: ジェル材料、パーツ仕入れ"
              className="w-full rounded-xl border px-3 py-3 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              レシート画像URL（任意）
            </label>
            <input
              type="text"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              placeholder="今は任意入力。後で画像アップロード対応予定"
              className="w-full rounded-xl border px-3 py-3 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "保存中..." : "経費を登録する"}
          </button>
        </form>
      </div>
    </div>
  );
}