"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  EXPENSE_RECEIPT_BUCKET,
  getExpenseReceiptStoragePath,
} from "@/lib/expenseReceiptStorage";
import ExpenseReceiptImage from "../ExpenseReceiptImage";

type ExpenseRow = {
  id: string;
  expense_date: string | null;
  category: string | null;
  amount: number | null;
  memo: string | null;
  receipt_url: string | null;
};

const EXPENSE_CATEGORIES = [
  "材料費",
  "消耗品費",
  "人件費",
  "法定福利費",
  "福利厚生費",
  "外注費",
  "広告宣伝費",
  "通信費",
  "旅費交通費",
  "支払手数料",
  "地代家賃",
  "水道光熱費",
  "租税公課",
  "医療費",
  "雑費",
] as const;

export default function ExpenseEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const expenseId = params?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<"not-found" | "failed" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState<string>("材料費");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const writeInFlightRef = useRef(false);

  useEffect(() => {
    if (!expenseId || expenseId === "[id]") {
      alert("IDが不正です");
      router.push("/expenses");
    }
  }, [expenseId, router]);

  const fetchExpense = useCallback(async () => {
    if (!expenseId || expenseId === "[id]") return;

    setIsLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, expense_date, category, amount, memo, receipt_url")
        .eq("id", expenseId)
        .single();

      if (error || !data) {
        console.error("経費詳細取得エラー:", error);
        setLoadError(error ? (error.code === "PGRST116" ? "not-found" : "failed") : "not-found");
        return;
      }

      const row = data as ExpenseRow;

      setExpenseDate(row.expense_date ?? "");
      setCategory(
        row.category && EXPENSE_CATEGORIES.includes(row.category as never)
          ? row.category
          : "雑費"
      );
      setAmount(String(row.amount ?? ""));
      setMemo(row.memo ?? "");
      setReceiptUrl(row.receipt_url ?? null);
    } catch (error) {
      console.error("経費詳細取得エラー:", error);
      setLoadError("failed");
    } finally {
      setIsLoading(false);
    }
  }, [expenseId]);

  useEffect(() => {
    void Promise.resolve().then(fetchExpense);
  }, [fetchExpense]);

  const uploadReceiptImage = async () => {
    if (!receiptFile) {
      return {
        path: "",
        publicUrl: receiptUrl,
      };
    }

    const ext = receiptFile.name.split(".").pop() || "jpg";
    const fileName = `expense-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(EXPENSE_RECEIPT_BUCKET)
      .upload(fileName, receiptFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`画像アップロードに失敗しました: ${uploadError.message}`);
    }

    const { data } = supabase.storage
      .from(EXPENSE_RECEIPT_BUCKET)
      .getPublicUrl(fileName);

    return {
      path: fileName,
      publicUrl: data.publicUrl,
    };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (writeInFlightRef.current) return;

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

    writeInFlightRef.current = true;
    setIsSaving(true);

    let uploadedReceiptPath = "";
    let expenseSaved = false;

    try {
      const previousReceiptPath = receiptFile
        ? getExpenseReceiptStoragePath(
            receiptUrl,
            process.env.NEXT_PUBLIC_SUPABASE_URL
          )
        : null;
      const nextReceipt = await uploadReceiptImage();
      uploadedReceiptPath = nextReceipt.path;

      const { error } = await supabase
        .from("expenses")
        .update({
          expense_date: expenseDate,
          category,
          amount: Number(amount),
          memo: memo.trim() || null,
          receipt_url: nextReceipt.publicUrl,
        })
        .eq("id", expenseId);

      if (error) {
        throw new Error(error.message);
      }

      expenseSaved = true;

      if (
        uploadedReceiptPath &&
        previousReceiptPath &&
        previousReceiptPath !== uploadedReceiptPath
      ) {
        try {
          const { error: cleanupError } = await supabase.storage
            .from(EXPENSE_RECEIPT_BUCKET)
            .remove([previousReceiptPath]);

          if (cleanupError) {
            console.error("旧レシート画像の回収エラー:", cleanupError);
          }
        } catch (cleanupError) {
          console.error("旧レシート画像の回収エラー:", cleanupError);
        }
      }

      alert("更新しました");
      router.push("/expenses");
    } catch (error) {
      console.error("経費更新エラー:", error);

      if (uploadedReceiptPath && !expenseSaved) {
        try {
          const { error: cleanupError } = await supabase.storage
            .from(EXPENSE_RECEIPT_BUCKET)
            .remove([uploadedReceiptPath]);

          if (cleanupError) {
            console.error("レシート画像の回収エラー:", cleanupError);
          }
        } catch (cleanupError) {
          console.error("レシート画像の回収エラー:", cleanupError);
        }
      }

      alert(
        error instanceof Error ? `保存に失敗しました: ${error.message}` : "保存に失敗しました"
      );
    } finally {
      writeInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!expenseId || expenseId === "[id]") {
      alert("IDが不正です");
      return;
    }

    if (writeInFlightRef.current) return;

    const ok = window.confirm(
      "この経費を削除しますか？\nCSV由来の確定データなら review に戻します。"
    );
    if (!ok) return;

    writeInFlightRef.current = true;
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
      writeInFlightRef.current = false;
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

  if (loadError) {
    return (
      <main className="p-4 pb-24 max-w-xl mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
          <h1 className="text-lg font-bold text-red-900">
            {loadError === "not-found"
              ? "経費データが見つかりません"
              : "経費データを取得できませんでした"}
          </h1>
          <p className="mt-2 text-sm text-red-800">
            {loadError === "not-found"
              ? "削除済み、または参照できない経費の可能性があります。"
              : "通信状況を確認して、もう一度お試しください。"}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void fetchExpense()}
              className="rounded-xl border border-red-300 bg-white px-4 py-3 font-medium text-red-900"
            >
              再試行
            </button>
            <button
              type="button"
              onClick={() => router.push("/expenses")}
              className="rounded-xl border border-red-300 bg-white px-4 py-3 font-medium text-red-900"
            >
              経費一覧に戻る
            </button>
          </div>
        </div>
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

        <div>
          <label className="block text-sm font-medium mb-1">レシート画像</label>

          {receiptUrl && (
            <div className="mb-3">
              <ExpenseReceiptImage src={receiptUrl} variant="detail" />
            </div>
          )}

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
            className="w-full rounded-xl border px-3 py-2 bg-white"
          />

          {receiptFile && (
            <p className="mt-2 text-sm text-gray-500">{receiptFile.name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <button
            type="submit"
            disabled={isSaving || isDeleting}
            className="w-full rounded-xl border px-4 py-3 font-medium"
          >
            {isSaving ? "保存中..." : "保存する"}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isSaving}
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
