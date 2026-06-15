"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ImportRow = {
  id: string;
  import_id: string | null;
  expense_date: string | null;
  amount: number | null;
  vendor_raw: string | null;
  description_raw: string | null;
  payment_method: string | null;
  receipt_status: string | null;
  review_status: string | null;
  duplicate_flag: boolean | null;
  excluded_flag: boolean | null;
  created_at: string | null;
};

function formatAmount(value: number | null) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

export default function ExpenseImportRowsPage() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchRows() {
    setLoading(true);

    const { data, error } = await supabase
      .from("expense_import_rows")
      .select(
        "id, import_id, expense_date, amount, vendor_raw, description_raw, payment_method, receipt_status, review_status, duplicate_flag, excluded_flag, created_at"
      )
      .eq("excluded_flag", false)
      .order("expense_date", { ascending: false })
      .limit(100);

    if (error) {
      console.error("CSV取込候補取得エラー:", error);
      alert(`CSV取込候補の取得に失敗しました: ${error.message}`);
      setRows([]);
    } else {
      setRows((data || []) as ImportRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void fetchRows();
  }, []);
  async function handleApprove(rowId: string) {
    const ok = window.confirm("この候補を正式な経費として登録しますか？");
    if (!ok) return;

    try {
      const res = await fetch("/api/expenses/import-rows/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rowId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "正式登録に失敗しました");
      }

      alert("正式登録しました");
      await fetchRows();
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "正式登録中にエラーが発生しました"
      );
    }
  }

  async function handleExclude(rowId: string) {
    const ok = window.confirm("この候補を除外しますか？");
    if (!ok) return;

    try {
      const res = await fetch("/api/expenses/import-rows/exclude", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rowId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "除外に失敗しました");
      }

     setRows((current) => current.filter((row) => row.id !== rowId));
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "除外中にエラーが発生しました"
      );
    }
  }
  return (
    <main className="mx-auto max-w-5xl p-4 pb-24">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CSV取込候補</h1>
          <p className="mt-1 text-sm text-gray-500">
            CSVから取り込んだ経費候補を確認できます。
          </p>
        </div>

        <Link href="/expenses" className="rounded-xl border px-4 py-2 text-sm">
          経費一覧へ戻る
        </Link>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-6">読み込み中...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-gray-600">
          CSV取込候補はありません。
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-slate-900">
                      {formatAmount(row.amount)}
                    </span>

                    <span className="rounded-full border px-2 py-1 text-xs">
                      {row.payment_method || "取込元未設定"}
                    </span>

                    {row.duplicate_flag ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                        重複候補
                      </span>
                    ) : null}

                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                      {row.review_status || "unreviewed"}
                    </span>
                  </div>

                  <div className="text-sm text-slate-700">
                    <div>
                      <span className="font-medium">利用日：</span>
                      {row.expense_date || "-"}
                    </div>
                    <div>
                      <span className="font-medium">利用先：</span>
                      {row.vendor_raw || "-"}
                    </div>
                    <div>
                      <span className="font-medium">内容：</span>
                      {row.description_raw || "-"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 md:w-[220px]">
                 <button
  type="button"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    void handleApprove(row.id);
  }}
  className="rounded-xl border px-3 py-2 text-sm font-bold text-blue-700"
>
  正式登録
</button>
             <button
  type="button"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    void handleExclude(row.id);
  }}
  className="rounded-xl border px-3 py-2 text-sm font-bold text-rose-700"
>
  除外
</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}