"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRelation =
  | {
      name: string | null;
    }
  | {
      name: string | null;
    }[]
  | null;

type Visit = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  price: number | null;
  memo: string | null;
  next_visit_date: string | null;
  next_proposal: string | null;
  next_suggestion: string | null;
  customers: CustomerRelation;
};

type QuickSelectMode = "current" | "previous" | "custom";

const BUSINESS_NAME = "Aily Nail Studio";
const REPORT_TITLE = "施術実績レポート";

function getCustomerName(customers: CustomerRelation) {
  if (!customers) return "顧客名なし";
  if (Array.isArray(customers)) {
    return customers[0]?.name || "顧客名なし";
  }
  return customers.name || "顧客名なし";
}

function formatDate(value: string | null) {
  if (!value) return "未設定";
  return value;
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined) return "¥0";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function getMonthPrefix(value: string | null) {
  if (!value) return null;

  const normalized = value.trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(value: string) {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${year}年${Number(month)}月`;
}

function buildCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildPreviousMonth() {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthOptions(rows: Visit[]) {
  const values = new Set<string>();
  values.add(buildCurrentMonth());

  rows.forEach((row) => {
    const prefix = getMonthPrefix(row.visit_date);
    if (prefix) values.add(prefix);
  });

  return Array.from(values)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({
      value,
      label: getMonthLabel(value),
    }));
}

function getReportComment(totalCount: number, totalSales: number, avgUnitPrice: number) {
  if (totalCount === 0) {
    return "対象月の施術実績データはありません。";
  }

  if (totalCount <= 5) {
    return `対象月の施術件数は${totalCount}件です。件数が少ない月のため、再来導線・次回提案導線の確認を推奨します。`;
  }

  if (avgUnitPrice >= 10000) {
    return `対象月の客単価は${formatPrice(avgUnitPrice)}で比較的高めです。高単価メニューや提案施策が機能している可能性があります。`;
  }

  if (totalSales >= 100000) {
    return `対象月の売上は${formatPrice(totalSales)}です。来店件数と単価のバランスを維持できているか継続確認を推奨します。`;
  }

  return "対象月の施術実績は大きな異常はありません。来店件数・客単価・次回提案の継続管理を推奨します。";
}

function getDocumentNumber(monthValue: string) {
  if (!monthValue) return "VR-0000-00";
  const [year, month] = monthValue.split("-");
  return `VR-${year}-${month}`;
}

export default function VisitsPageClient() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(buildCurrentMonth());
  const [quickSelectMode, setQuickSelectMode] = useState<QuickSelectMode>("current");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    void fetchVisits();
  }, []);

  async function fetchVisits() {
    setLoading(true);

    const { data, error } = await supabase
      .from("visits")
      .select(
        `
        id,
        customer_id,
        visit_date,
        price,
        memo,
        next_visit_date,
        next_proposal,
        next_suggestion,
        customers (
          name
        )
      `
      )
      .order("visit_date", { ascending: false });

    if (error) {
      console.error("来店履歴の取得エラー:", error);
      setVisits([]);
      setLoading(false);
      return;
    }

    const nextVisits = (data as Visit[]) || [];
    setVisits(nextVisits);

    const currentMonth = buildCurrentMonth();
    const previousMonth = buildPreviousMonth();

    if (nextVisits.some((visit) => getMonthPrefix(visit.visit_date) === currentMonth)) {
      setSelectedMonth(currentMonth);
      setQuickSelectMode("current");
    } else if (
      nextVisits.some((visit) => getMonthPrefix(visit.visit_date) === previousMonth)
    ) {
      setSelectedMonth(previousMonth);
      setQuickSelectMode("previous");
    } else {
      const options = buildMonthOptions(nextVisits);
      if (options.length > 0) {
        setSelectedMonth(options[0].value);
      }
      setQuickSelectMode("custom");
    }

    setLoading(false);
  }

  const monthOptions = useMemo(() => buildMonthOptions(visits), [visits]);

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => getMonthPrefix(visit.visit_date) === selectedMonth);
  }, [visits, selectedMonth]);

  const totalSales = useMemo(() => {
    return filteredVisits.reduce((sum, visit) => sum + (visit.price ?? 0), 0);
  }, [filteredVisits]);

  const visitCount = filteredVisits.length;

  const avgUnitPrice = useMemo(() => {
    if (visitCount === 0) return 0;
    return totalSales / visitCount;
  }, [totalSales, visitCount]);

  const reportComment = getReportComment(visitCount, totalSales, avgUnitPrice);

  const currentMonthValue = buildCurrentMonth();
  const previousMonthValue = buildPreviousMonth();

  const hasCurrentMonth = useMemo(() => {
    return visits.some((visit) => getMonthPrefix(visit.visit_date) === currentMonthValue);
  }, [visits, currentMonthValue]);

  const hasPreviousMonth = useMemo(() => {
    return visits.some((visit) => getMonthPrefix(visit.visit_date) === previousMonthValue);
  }, [visits, previousMonthValue]);

  const selectedMonthLabel = getMonthLabel(selectedMonth);
  const documentNumber = getDocumentNumber(selectedMonth);

  function handleQuickSelect(mode: QuickSelectMode) {
    if (mode === "current" && hasCurrentMonth) {
      setSelectedMonth(currentMonthValue);
      setQuickSelectMode("current");
      return;
    }

    if (mode === "previous" && hasPreviousMonth) {
      setSelectedMonth(previousMonthValue);
      setQuickSelectMode("previous");
      return;
    }

    setQuickSelectMode("custom");
  }

  function handleCustomMonthChange(value: string) {
    setSelectedMonth(value);

    if (value === currentMonthValue) {
      setQuickSelectMode("current");
      return;
    }

    if (value === previousMonthValue) {
      setQuickSelectMode("previous");
      return;
    }

    setQuickSelectMode("custom");
  }

  function handlePrint() {
    if (filteredVisits.length === 0) {
      alert("出力するデータがありません");
      return;
    }
    window.print();
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  const previewContent = (
    <div className="print-area bg-white text-slate-900">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="pdf-cover flex min-h-[88vh] flex-col justify-center rounded-2xl border bg-white px-8 py-16 text-center print:rounded-none">
          <div className="mb-3 text-sm tracking-[0.18em] text-slate-400">
            VISIT REPORT
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
                {selectedMonthLabel} 施術実績サマリー
              </h2>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>{documentNumber}</div>
              <div className="mt-1">{REPORT_TITLE}</div>
            </div>
          </div>

          <div className="pdf-summary-grid mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">施術件数</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {visitCount.toLocaleString()}件
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">売上合計</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatPrice(totalSales)}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">客単価</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatPrice(avgUnitPrice)}
              </div>
            </div>
          </div>

          <div className="mb-5 rounded-2xl border bg-white p-4">
            <div className="mb-2 text-sm font-bold text-slate-900">所見</div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm leading-7 text-slate-700">
              {reportComment}
            </div>
          </div>

          {filteredVisits.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-gray-500">
              来店履歴がありません
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVisits.map((visit) => {
                const customerName = getCustomerName(visit.customers);
                const proposal =
                  visit.next_proposal || visit.next_suggestion || "未設定";

                return (
                  <div
                    key={visit.id}
                    className="avoid-break rounded-2xl border bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-lg font-semibold text-slate-900">
                          {customerName}
                        </div>
                        <div className="text-sm text-gray-500">
                          来店日: {formatDate(visit.visit_date)}
                        </div>
                      </div>

                      <div className="shrink-0 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                        {formatPrice(visit.price)}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                      <div>
                        <span className="font-medium">次回来店予定:</span>{" "}
                        {formatDate(visit.next_visit_date)}
                      </div>

                      <div>
                        <span className="font-medium">次回提案:</span> {proposal}
                      </div>

                      <div>
                        <span className="font-medium">メモ:</span>{" "}
                        {visit.memo?.trim() ? visit.memo : "なし"}
                      </div>
                    </div>
                  </div>
                );
              })}
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
      <div className="p-4 pb-24 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">来店一覧</h1>
            <p className="mt-1 text-sm text-slate-500">
              対象月を切り替えて、施術実績をそのままPDF出力できます。
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

            <Link
              href="/visits/new"
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            >
              来店履歴を追加
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3">
            <div className="text-sm font-bold text-slate-900">対象月クイック選択</div>
            <div className="mt-1 text-xs text-slate-500">
              今月 / 先月 / 任意月 をすぐ切り替えできます。
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleQuickSelect("current")}
              disabled={!hasCurrentMonth}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${
                quickSelectMode === "current"
                  ? "bg-blue-600 text-white"
                  : "border bg-white text-slate-700"
              } disabled:opacity-50`}
            >
              今月
            </button>

            <button
              type="button"
              onClick={() => handleQuickSelect("previous")}
              disabled={!hasPreviousMonth}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${
                quickSelectMode === "previous"
                  ? "bg-blue-600 text-white"
                  : "border bg-white text-slate-700"
              } disabled:opacity-50`}
            >
              先月
            </button>

            <button
              type="button"
              onClick={() => setQuickSelectMode("custom")}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${
                quickSelectMode === "custom"
                  ? "bg-blue-600 text-white"
                  : "border bg-white text-slate-700"
              }`}
            >
              任意月
            </button>
          </div>

          {quickSelectMode === "custom" ? (
            <div className="mt-4 max-w-xs">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                任意月を選択
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => handleCustomMonthChange(e.target.value)}
                className="w-full rounded-lg border bg-white px-3 py-2"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">施術件数</div>
            <div className="mt-2 text-xl font-bold text-slate-900">
              {visitCount.toLocaleString()}件
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">売上合計</div>
            <div className="mt-2 text-xl font-bold text-slate-900">
              {formatPrice(totalSales)}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">客単価</div>
            <div className="mt-2 text-xl font-bold text-slate-900">
              {formatPrice(avgUnitPrice)}
            </div>
          </div>
        </div>

        {filteredVisits.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-gray-500 shadow-sm">
            来店履歴がありません
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVisits.map((visit) => {
              const customerName = getCustomerName(visit.customers);
              const proposal =
                visit.next_proposal || visit.next_suggestion || "未設定";

              return (
                <div
                  key={visit.id}
                  className="rounded-2xl border bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-lg font-semibold text-slate-900">
                        {customerName}
                      </div>
                      <div className="text-sm text-gray-500">
                        来店日: {formatDate(visit.visit_date)}
                      </div>
                    </div>

                    <Link
                      href={`/visits/${visit.id}/edit`}
                      className="shrink-0 rounded-lg border px-3 py-2 text-sm"
                    >
                      編集
                    </Link>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                    <div>
                      <span className="font-medium">売上:</span>{" "}
                      {formatPrice(visit.price)}
                    </div>

                    <div>
                      <span className="font-medium">次回来店予定:</span>{" "}
                      {formatDate(visit.next_visit_date)}
                    </div>

                    <div>
                      <span className="font-medium">次回提案:</span> {proposal}
                    </div>

                    <div>
                      <span className="font-medium">メモ:</span>{" "}
                      {visit.memo?.trim() ? visit.memo : "なし"}
                    </div>
                  </div>
                </div>
              );
            })}
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
      </div>

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

          .pdf-summary-grid {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
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