"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ExpenseRow = {
  id: string;
  expense_date: string | null;
  category: string | null;
  amount: number | null;
  memo: string | null;
  receipt_url: string | null;
};

type CategorySummaryRow = {
  category: string;
  amount: number;
  percent: number;
};

const BUSINESS_NAME = "Aily Nail Studio";
const REPORT_TITLE = "月次経費レポート";

const CATEGORY_COLORS = [
  "#2563eb",
  "#ef4444",
  "#16a34a",
  "#f59e0b",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#475569",
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function buildCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function normalizeDateToMonthPrefix(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim().replace(/\//g, "-");

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed.slice(0, 7);
    }

    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}`;
    }

    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}`;
  }

  return null;
}

function buildMonthOptionsFromRows(rows: ExpenseRow[]) {
  const values = new Set<string>();
  values.add(buildCurrentMonth());

  for (const row of rows) {
    const month = normalizeDateToMonthPrefix(row.expense_date);
    if (month) values.add(month);
  }

  return Array.from(values)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => {
      const [year, month] = value.split("-");
      return {
        value,
        label: `${year}年${Number(month)}月`,
      };
    });
}

function formatAmount(amount: number | null) {
  return `¥${new Intl.NumberFormat("ja-JP").format(Number(amount ?? 0))}`;
}

function getMonthLabel(value: string) {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${year}年${Number(month)}月`;
}

function getDocumentNumber(monthValue: string) {
  if (!monthValue) return "ER-0000-00";
  const [year, month] = monthValue.split("-");
  return `ER-${year}-${month}`;
}

function getReportComment(
  totalRows: number,
  totalAmount: number,
  topCategory?: CategorySummaryRow
) {
  if (totalRows === 0) {
    return "当月の経費データはありません。";
  }

  if (totalRows <= 5) {
    return `当月の経費件数は${totalRows}件です。件数は少なめですが、証憑と分類の整合性確認を推奨します。`;
  }

  if (topCategory && topCategory.percent >= 50) {
    return `最大カテゴリは「${topCategory.category}」で、当月経費全体の${topCategory.percent.toFixed(
      1
    )}%を占めています。偏りの大きい支出月として内容確認を推奨します。`;
  }

  if (totalAmount >= 100000) {
    return "当月経費は比較的大きめです。高額支出の内容と証憑添付状況の確認を推奨します。";
  }

  return "当月経費は大きな偏りは見られません。分類・金額・証憑の整合性確認を継続してください。";
}

function csvEscape(value: unknown) {
  const text =
    value === null || value === undefined ? "" : String(value).replace(/\r?\n/g, " ");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const blob = new Blob([bom, csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ExpensesPage() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(buildCurrentMonth());
  const [isMounted, setIsMounted] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  async function fetchExpenses() {
    setIsLoading(true);

    const { data, error } = await supabase
      .from("expenses")
      .select("id, expense_date, category, amount, memo, receipt_url")
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      console.error("経費一覧取得エラー:", error);
      alert(`経費一覧の取得に失敗しました: ${error.message}`);
      setRows([]);
      setIsLoading(false);
      return;
    }

    const nextRows = (data ?? []) as ExpenseRow[];
    setRows(nextRows);

    const options = buildMonthOptionsFromRows(nextRows);
    const hasSelectedMonth = options.some((option) => option.value === selectedMonth);

    if (!hasSelectedMonth && options.length > 0) {
      setSelectedMonth(options[0].value);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    void fetchExpenses();
  }, []);

  const monthOptions = useMemo(() => buildMonthOptionsFromRows(rows), [rows]);

  const monthFilteredRows = useMemo(() => {
    return rows.filter((row) => {
      const monthPrefix = normalizeDateToMonthPrefix(row.expense_date);
      if (!monthPrefix) return false;
      return monthPrefix === selectedMonth;
    });
  }, [rows, selectedMonth]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return monthFilteredRows;

    return monthFilteredRows.filter((row) => {
      const target = [
        row.id ?? "",
        row.expense_date ?? "",
        row.category ?? "",
        String(row.amount ?? ""),
        row.memo ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return target.includes(keyword);
    });
  }, [monthFilteredRows, search]);

  const totalAmount = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  }, [filteredRows]);

  const totalRows = filteredRows.length;

  const categorySummaryRows = useMemo(() => {
    const map = new Map<string, number>();

    filteredRows.forEach((row) => {
      const key =
        typeof row.category === "string" && row.category.trim().length > 0
          ? row.category.trim()
          : "未分類";

      map.set(key, (map.get(key) ?? 0) + Number(row.amount ?? 0));
    });

    const total = Array.from(map.values()).reduce((sum, amount) => sum + amount, 0);

    return Array.from(map.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredRows]);

  const topCategory = categorySummaryRows[0];
  const reportComment = getReportComment(totalRows, totalAmount, topCategory);
  const selectedMonthLabel = getMonthLabel(selectedMonth);
  const documentNumber = getDocumentNumber(selectedMonth);

  function handleDownloadCSV() {
    if (filteredRows.length === 0) {
      alert("出力するデータがありません");
      return;
    }

    const csvRows: (string | number)[][] = [
      [
        "経費ID",
        "利用日",
        "勘定科目",
        "金額",
        "内容",
        "証憑有無",
        "証憑URL",
      ],
      ...filteredRows.map((row) => [
        row.id,
        row.expense_date ?? "",
        row.category ?? "未分類",
        row.amount ?? 0,
        row.memo ?? "",
        row.receipt_url ? "あり" : "なし",
        row.receipt_url ?? "",
      ]),
    ];

    downloadCsv(`経費明細_${selectedMonth}.csv`, csvRows);
  }

  function handlePrint() {
    if (filteredRows.length === 0) {
      alert("出力するデータがありません");
      return;
    }

    window.print();
  }

  async function handleDelete(id: string) {
    const ok = window.confirm(
      "この経費を削除しますか？\nCSV由来の確定データなら review に戻します。"
    );
    if (!ok) return;

    setDeletingId(id);

    try {
      const res = await fetch("/api/expenses/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expenseId: id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "削除に失敗しました");
      }

      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (error) {
      console.error("経費削除エラー:", error);
      alert(error instanceof Error ? error.message : "削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  }

  const previewContent = (
    <div className="print-area bg-white text-slate-900">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="pdf-cover flex min-h-[88vh] flex-col justify-center rounded-2xl border bg-white px-8 py-16 text-center print:rounded-none">
          <div className="mb-3 text-sm tracking-[0.18em] text-slate-400">
            EXPENSE REPORT
          </div>
          <div className="mb-2 text-sm text-slate-500">{BUSINESS_NAME}</div>
          <h1 className="mb-4 text-3xl font-bold text-slate-900">{REPORT_TITLE}</h1>
          <div className="mx-auto mb-8 h-px w-24 bg-slate-300" />

          <div className="space-y-3 text-base text-slate-700">
            <div>
              <span className="font-semibold text-slate-900">対象月：</span>
              {selectedMonthLabel}
            </div>
            <div>
              <span className="font-semibold text-slate-900">資料番号：</span>
              {documentNumber}
            </div>
            <div>
              <span className="font-semibold text-slate-900">作成日：</span>
              {new Date().toLocaleDateString("ja-JP")}
            </div>
          </div>

          <div className="mt-12 text-sm text-slate-400">Naily AiDOL</div>
        </div>

        <div className="mt-6 rounded-2xl border bg-white p-5 print:mt-0 print:rounded-none">
          <div className="mb-4 flex items-start justify-between gap-4 border-b pb-4">
            <div>
              <div className="text-sm text-slate-500">{BUSINESS_NAME}</div>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                {selectedMonthLabel} 経費サマリー
              </h2>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>{documentNumber}</div>
              <div className="mt-1">{REPORT_TITLE}</div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">対象月</div>
              <div className="mt-2 text-lg font-bold text-slate-900">
                {selectedMonthLabel}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">件数</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {totalRows.toLocaleString()}件
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">合計経費</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatAmount(totalAmount)}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">最大カテゴリ</div>
              <div className="mt-2 text-lg font-bold text-slate-900">
                {topCategory ? topCategory.category : "データなし"}
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border bg-white p-4">
            <h2 className="mb-3 text-lg font-bold text-slate-900">経費所見</h2>
            <div className="rounded-xl bg-slate-50 p-3 text-sm leading-7 text-slate-700">
              {reportComment}
            </div>
          </div>

          <div className="mb-6 rounded-2xl border bg-white p-4">
            <h2 className="mb-3 text-lg font-bold text-slate-900">カテゴリ集計</h2>

            {categorySummaryRows.length === 0 ? (
              <div className="text-sm text-slate-500">カテゴリデータがありません。</div>
            ) : (
              <div className="space-y-3">
                {categorySummaryRows.slice(0, 5).map((row, index) => (
                  <div
                    key={row.category}
                    className={`rounded-xl border p-3 ${
                      index === 0 ? "border-amber-200 bg-amber-50" : "bg-white"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{
                            backgroundColor:
                              CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                          }}
                        />
                        <span className="font-semibold text-slate-900">
                          {row.category}
                        </span>
                        {topCategory?.category === row.category ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                            最大
                          </span>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-slate-900">
                          {formatAmount(row.amount)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.percent.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="h-2.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2.5 rounded-full"
                        style={{
                          width: `${Math.max(row.percent, 4)}%`,
                          backgroundColor:
                            CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">
              該当する経費がありません
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRows.map((row) => (
                <div
                  key={row.id}
                  className="avoid-break rounded-2xl border bg-white p-4"
                >
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold text-slate-900">
                          {formatAmount(row.amount)}
                        </span>
                        <span className="rounded-full border px-2 py-1 text-xs">
                          {row.category || "未分類"}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm text-slate-700">
                        <div>
                          <span className="font-medium">日付:</span>{" "}
                          {row.expense_date || "-"}
                        </div>
                        <div>
                          <span className="font-medium">内容:</span>{" "}
                          {row.memo || "-"}
                        </div>
                      </div>
                    </div>

                    <div className="w-[140px] shrink-0">
                      {row.receipt_url ? (
                        <img
                          src={row.receipt_url}
                          alt="レシート"
                          className="h-[96px] w-full rounded-xl border object-cover"
                        />
                      ) : (
                        <div className="flex h-[96px] w-full items-center justify-center rounded-xl border text-xs text-slate-400">
                          画像なし
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 border-t pt-3 text-right text-xs text-slate-400">
            {BUSINESS_NAME} / {REPORT_TITLE}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <main className="mx-auto max-w-5xl p-4 pb-24">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">経費一覧</h1>
            <p className="mt-1 text-sm text-gray-500">
              登録済みの経費を確認・編集・削除できます。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
              対象月: {selectedMonthLabel}
            </span>

            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow hover:bg-slate-800"
            >
              PDFプレビュー
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border bg-white p-4 space-y-3 shadow-sm">
          <div>
            <label className="mb-2 block text-sm font-medium">対象月</label>
            {isMounted ? (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-lg border bg-white px-3 py-2"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full rounded-lg border bg-white px-3 py-2">
                {selectedMonth}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">検索</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="カテゴリ、メモ、金額、日付で検索"
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div className="text-sm text-gray-700">
            表示件数: {filteredRows.length}件 / 合計: {formatAmount(totalAmount)}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/expenses/new"
              className="rounded-xl border px-4 py-2 text-sm font-medium"
            >
              新規登録
            </Link>

            <button
              type="button"
              onClick={handleDownloadCSV}
              className="rounded-xl border px-4 py-2 text-sm font-medium"
            >
              経費明細CSV
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border p-6">読み込み中...</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border p-6 text-gray-600">
            該当する経費がありません
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRows.map((row) => (
              <div key={row.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex-1 space-y-3">
                    {row.receipt_url ? (
                      <div className="w-full max-w-[220px] overflow-hidden rounded-xl border bg-white">
                        <img
                          src={row.receipt_url}
                          alt="レシート"
                          className="h-[140px] w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-[140px] w-full max-w-[220px] items-center justify-center rounded-xl border text-sm text-gray-400">
                        画像なし
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-slate-900">
                        {formatAmount(row.amount)}
                      </span>
                      <span className="rounded-full border px-2 py-1 text-xs">
                        {row.category || "未分類"}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-gray-700">
                      <div>
                        <span className="font-medium">日付:</span>{" "}
                        {row.expense_date || "-"}
                      </div>
                      <div>
                        <span className="font-medium">内容:</span>{" "}
                        {row.memo || "-"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:w-[220px]">
                    <Link
                      href={`/expenses/${row.id}`}
                      className="rounded-xl border px-3 py-2 text-center text-sm"
                    >
                      編集
                    </Link>

                    <button
                      type="button"
                      disabled={deletingId === row.id}
                      onClick={() => handleDelete(row.id)}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      {deletingId === row.id ? "削除中..." : "削除"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {isPreviewOpen ? (
          <div className="fixed inset-0 z-50 bg-black/50 p-4 print:bg-white print:p-0">
            <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
              <div className="preview-toolbar flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">PDFプレビュー</div>
                  <div className="text-sm text-slate-500">
                    内容を確認してから印刷 / PDF保存できます
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    印刷 / PDF保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(false)}
                    className="rounded-lg border px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    閉じる
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-100 p-4 print:overflow-visible print:bg-white print:p-0">
                {previewContent}
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body {
            zoom: 0.96;
          }

          body * {
            visibility: hidden !important;
          }

          .print-area,
          .print-area * {
            visibility: visible !important;
          }

          .print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            box-shadow: none !important;
          }

          .preview-toolbar {
            display: none !important;
          }

          .pdf-cover {
            page-break-after: always;
            break-after: page;
          }

          .avoid-break {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .rounded-xl,
          .rounded-lg,
          .rounded-2xl {
            border-radius: 0 !important;
          }

          h1 {
            font-size: 20px !important;
            line-height: 1.25 !important;
            margin-bottom: 6px !important;
          }

          h2 {
            font-size: 15px !important;
            line-height: 1.3 !important;
            margin-bottom: 4px !important;
          }

          p,
          div,
          span,
          td,
          th {
            line-height: 1.4 !important;
          }

          .print-area table,
          .print-area tr,
          .print-area td,
          .print-area th {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}