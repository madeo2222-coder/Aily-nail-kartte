"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SourceType = "credit_card" | "paypay";

export default function ExpenseImportPage() {
  const router = useRouter();

  const [sourceType, setSourceType] = useState<SourceType>("credit_card");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      alert("CSVファイルを選択してください");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("sourceType", sourceType);
      formData.append("file", file);

      const res = await fetch("/api/expenses/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "CSV取込に失敗しました");
      }

      alert(
        `CSV取込が完了しました\n取込件数: ${data.rowCount}件\n取込元: ${data.sourceType}`
      );

      router.push("/expenses");
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "CSV取込中にエラーが発生しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="p-4 pb-24 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">CSVで経費候補を取り込む</h1>
        <p className="text-sm text-gray-500 mt-1">
          クレカやPayPayのCSVを取り込み、経費候補として保存します。
          この時点では正式な経費にはなりません。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-2">取込元</label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as SourceType)}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="credit_card">クレジットカード</option>
            <option value="paypay">PayPay</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">CSVファイル</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const selected = e.target.files?.[0] ?? null;
              setFile(selected);
            }}
            className="w-full rounded-xl border px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-2">
            UTF-8のCSVを推奨します。初版では一般的な列名に対応します。
          </p>
        </div>

        <div className="rounded-2xl border p-4 text-sm text-gray-700 bg-gray-50">
          <p className="font-medium mb-2">この画面でやること</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>CSVを取り込む</li>
            <li>経費候補として保存する</li>
            <li>まだ正式経費にはしない</li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl border px-4 py-3 font-medium"
        >
          {isSubmitting ? "取込中..." : "CSVを取り込む"}
        </button>
      </form>
    </main>
  );
}