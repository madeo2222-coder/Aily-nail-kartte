"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import PdfPreviewModal from "@/components/pdf/PdfPreviewModal";
import MonthlyReportPdf from "@/components/pdf/MonthlyReportPdf";
import Onboarding from "@/components/Onboarding";

type Row = {
  month: string;
  sales: number;
  expenses: number;
  profit: number;
};

type VisitRow = Record<string, unknown>;
type ExpenseRow = Record<string, unknown>;
type QuickSelectMode = "current" | "previous" | "custom";

type CategoryRow = {
  category: string;
  amount: number;
  percent: number;
};

type MonthlySummary = {
  month?: string;
  totalSales?: number;
  totalExpenses?: number;
  profit?: number;
  visitCount?: number;
  avgUnitPrice?: number;
  expenseCount?: number;
  categoryRows?: CategoryRow[];
};
type StaffRole = "owner" | "manager" | "staff";

type CurrentStaff = {
  id: string;
  salon_id: string | null;
  name: string | null;
  role: StaffRole | null;
  user_id: string | null;
};

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function toSafeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getDateValue(row: Record<string, unknown>, candidates: string[]) {
  for (const key of candidates) {
    const raw = row[key];

    if (typeof raw === "string" || raw instanceof Date) {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  return null;
}

function rate(cur: number, prev: number) {
  if (prev === 0) {
    if (cur === 0) return 0;
    return 100;
  }
  return ((cur - prev) / prev) * 100;
}

function arrow(n: number) {
  if (n > 0) return "↑";
  if (n < 0) return "↓";
  return "→";
}

function changeLabel(value: number, kind: "sales" | "expenses" | "profit") {
  const abs = Math.abs(value);

  if (kind === "sales") {
    if (value <= -30) return "大幅減";
    if (value < 0) return "減少";
    if (value >= 30) return "大幅増";
    if (value > 0) return "増加";
    return "横ばい";
  }

  if (kind === "expenses") {
    if (value >= 100) return "異常増";
    if (value >= 30) return "大幅増";
    if (value > 0) return "増加";
    if (value <= -30) return "大幅減";
    if (value < 0) return "減少";
    return "横ばい";
  }

  if (abs >= 100) return "危険";
  if (value <= -30) return "大幅悪化";
  if (value < 0) return "悪化";
  if (value >= 30) return "大幅改善";
  if (value > 0) return "改善";
  return "横ばい";
}

function getRateColor(value: number, kind: "sales" | "expenses" | "profit") {
  if (kind === "sales") return value >= 0 ? "text-blue-600" : "text-red-500";
  if (kind === "expenses") return value > 0 ? "text-red-500" : "text-blue-600";
  return value >= 0 ? "text-green-600" : "text-red-500";
}

function buildComment(current: Row | undefined, previous: Row | undefined) {
  if (!current || !previous) {
    return {
      title: "データ確認中",
      body: "前月との比較データがまだ不足しています。",
      tone: "normal" as const,
    };
  }

  const salesRate = rate(current.sales, previous.sales);
  const expenseRate = rate(current.expenses, previous.expenses);
  const profitRate = rate(current.profit, previous.profit);

  if (current.profit < 0) {
    return {
      title: "🚨 今月は赤字です（危険）",
      body: "売上低下か経費増加のどちらが原因かを最優先で切り分け、広告費・材料費・外注費の増加有無を確認してください。",
      tone: "danger" as const,
    };
  }

  if (expenseRate >= 100) {
    return {
      title: "⚠️ 経費が急増しています",
      body: "今月はコスト増がかなり強く出ています。固定費化していないか、投資対効果が取れているか確認してください。",
      tone: "warning" as const,
    };
  }

  if (profitRate <= -30) {
    return {
      title: "⚠️ 粗利が大きく悪化しています",
      body: "売上・経費のバランスが崩れています。客単価、再来率、不要コストの3点を優先して見直してください。",
      tone: "warning" as const,
    };
  }

  if (salesRate >= 10 && profitRate >= 10) {
    return {
      title: "✅ 今月は良い流れです",
      body: "売上と粗利がともに伸びています。利益が出た導線を強化しつつ、再来導線と単価アップ施策を継続してください。",
      tone: "good" as const,
    };
  }

  return {
    title: "ℹ️ 今月は大きな異常はありません",
    body: "数字は概ね安定しています。売上推移、経費バランス、再来率の3点を継続確認していきましょう。",
    tone: "normal" as const,
  };
}

function getMonthLabel(value: string) {
  const [year, month] = value.split("/");
  if (!year || !month) return value;
  return `${year}年${Number(month)}月`;
}

function getPreviousMonthValue(value: string) {
  const [yearText, monthText] = value.split("/");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return "";
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}/${date.getMonth() + 1}`;
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}/${now.getMonth() + 1}`;
}

function getDangerLevel(current: Row | undefined, previous: Row | undefined) {
  if (!current || !previous) {
    return {
      label: "判定中",
      score: 50,
      badgeClass: "bg-slate-100 text-slate-700",
      barClass: "bg-slate-400",
    };
  }

  const profitRate = rate(current.profit, previous.profit);
  const expenseRate = rate(current.expenses, previous.expenses);

  if (current.profit < 0 || profitRate <= -30 || expenseRate >= 100) {
    return {
      label: "高",
      score: 85,
      badgeClass: "bg-red-100 text-red-700",
      barClass: "bg-red-500",
    };
  }

  if (profitRate < 0 || expenseRate >= 30) {
    return {
      label: "中",
      score: 60,
      badgeClass: "bg-amber-100 text-amber-700",
      barClass: "bg-amber-500",
    };
  }

  return {
    label: "低",
    score: 25,
    badgeClass: "bg-green-100 text-green-700",
    barClass: "bg-green-500",
  };
}

const demoRows: Row[] = [
  { month: "2025/11", sales: 180000, expenses: 90000, profit: 90000 },
  { month: "2025/12", sales: 220000, expenses: 100000, profit: 120000 },
  { month: "2026/1", sales: 260000, expenses: 120000, profit: 140000 },
  { month: "2026/2", sales: 300000, expenses: 150000, profit: 150000 },
  { month: "2026/3", sales: 280000, expenses: 140000, profit: 140000 },
  { month: "2026/4", sales: 340000, expenses: 160000, profit: 180000 },
];

const demoSummaryMap: Record<string, MonthlySummary> = {
  "2025/11": {
    month: "2025/11",
    totalSales: 180000,
    totalExpenses: 90000,
    profit: 90000,
    visitCount: 18,
    avgUnitPrice: 10000,
    expenseCount: 8,
    categoryRows: [
      { category: "材料費", amount: 38000, percent: 42.2 },
      { category: "広告宣伝費", amount: 22000, percent: 24.4 },
      { category: "消耗品費", amount: 15000, percent: 16.7 },
      { category: "通信費", amount: 9000, percent: 10.0 },
      { category: "雑費", amount: 6000, percent: 6.7 },
    ],
  },
  "2025/12": {
    month: "2025/12",
    totalSales: 220000,
    totalExpenses: 100000,
    profit: 120000,
    visitCount: 22,
    avgUnitPrice: 10000,
    expenseCount: 9,
    categoryRows: [
      { category: "材料費", amount: 42000, percent: 42.0 },
      { category: "広告宣伝費", amount: 26000, percent: 26.0 },
      { category: "消耗品費", amount: 16000, percent: 16.0 },
      { category: "通信費", amount: 9000, percent: 9.0 },
      { category: "雑費", amount: 7000, percent: 7.0 },
    ],
  },
  "2026/1": {
    month: "2026/1",
    totalSales: 260000,
    totalExpenses: 120000,
    profit: 140000,
    visitCount: 24,
    avgUnitPrice: 10833,
    expenseCount: 10,
    categoryRows: [
      { category: "材料費", amount: 47000, percent: 39.2 },
      { category: "広告宣伝費", amount: 34000, percent: 28.3 },
      { category: "消耗品費", amount: 18000, percent: 15.0 },
      { category: "通信費", amount: 10000, percent: 8.3 },
      { category: "雑費", amount: 11000, percent: 9.2 },
    ],
  },
  "2026/2": {
    month: "2026/2",
    totalSales: 300000,
    totalExpenses: 150000,
    profit: 150000,
    visitCount: 28,
    avgUnitPrice: 10714,
    expenseCount: 11,
    categoryRows: [
      { category: "材料費", amount: 56000, percent: 37.3 },
      { category: "広告宣伝費", amount: 43000, percent: 28.7 },
      { category: "消耗品費", amount: 22000, percent: 14.7 },
      { category: "通信費", amount: 12000, percent: 8.0 },
      { category: "雑費", amount: 17000, percent: 11.3 },
    ],
  },
  "2026/3": {
    month: "2026/3",
    totalSales: 280000,
    totalExpenses: 140000,
    profit: 140000,
    visitCount: 25,
    avgUnitPrice: 11200,
    expenseCount: 10,
    categoryRows: [
      { category: "材料費", amount: 50000, percent: 35.7 },
      { category: "広告宣伝費", amount: 38000, percent: 27.1 },
      { category: "消耗品費", amount: 21000, percent: 15.0 },
      { category: "通信費", amount: 12000, percent: 8.6 },
      { category: "雑費", amount: 19000, percent: 13.6 },
    ],
  },
  "2026/4": {
    month: "2026/4",
    totalSales: 340000,
    totalExpenses: 160000,
    profit: 180000,
    visitCount: 31,
    avgUnitPrice: 10968,
    expenseCount: 12,
    categoryRows: [
      { category: "材料費", amount: 59000, percent: 36.9 },
      { category: "広告宣伝費", amount: 48000, percent: 30.0 },
      { category: "消耗品費", amount: 23000, percent: 14.4 },
      { category: "通信費", amount: 12000, percent: 7.5 },
      { category: "雑費", amount: 18000, percent: 11.3 },
    ],
  },
};

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [quickSelectMode, setQuickSelectMode] =
    useState<QuickSelectMode>("current");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generatedReportMessage, setGeneratedReportMessage] = useState("");
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
    const [currentStaff, setCurrentStaff] = useState<CurrentStaff | null>(null);
      const [monthlyStaffVisits, setMonthlyStaffVisits] = useState<
    { id: string; visit_date: string | null; price: number; staff_name: string | null }[]
  >([]);

  useEffect(() => {
        async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let staffRow: CurrentStaff | null = null;

      if (user) {
        const { data: staffData, error: staffError } = await supabase
          .from("staffs")
          .select("id, salon_id, name, role, user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (staffError) {
          console.error("staffs fetch error:", staffError);
        } else {
          staffRow = (staffData as CurrentStaff | null) ?? null;
        }
      }

      setCurrentStaff(staffRow);

      let visitsQuery = supabase.from("visits").select("*");
      let expensesQuery = supabase.from("expenses").select("*");

      if (staffRow?.salon_id) {
        visitsQuery = visitsQuery.eq("salon_id", staffRow.salon_id);
        expensesQuery = expensesQuery.eq("salon_id", staffRow.salon_id);
      }

      if (staffRow?.role === "staff" && staffRow.name) {
        visitsQuery = visitsQuery.eq("staff_name", staffRow.name);
      }

      const [visitsResult, expensesResult] = await Promise.all([
        visitsQuery,
        expensesQuery,
      ]);

      if (visitsResult.error) {
        console.error("visits fetch error:", visitsResult.error);
      }

      if (expensesResult.error) {
        console.error("expenses fetch error:", expensesResult.error);
      }

      const visits = (visitsResult.data ?? []) as VisitRow[];
      const currentMonth = getCurrentMonthValue();
      const [currentYearText, currentMonthText] = currentMonth.split("/");
      const currentYear = Number(currentYearText);
      const currentMonthNumber = Number(currentMonthText);

            const monthlyStaffRows: {
        id: string;
        visit_date: string | null;
        price: number;
        staff_name: string | null;
      }[] = visits
        .map((item) => {
          const rawDate =
            (item.visit_date as string | null) ??
            (item.date as string | null) ??
            (item.visited_at as string | null) ??
            (item.created_at as string | null) ??
            null;

          if (!rawDate) return null;

          const parsed = new Date(rawDate);
          if (Number.isNaN(parsed.getTime())) return null;

          if (
            parsed.getFullYear() !== currentYear ||
            parsed.getMonth() + 1 !== currentMonthNumber
          ) {
            return null;
          }

          return {
            id: String(item.id ?? ""),
            visit_date: rawDate,
            price: toSafeNumber(
              item.price ?? item.amount ?? item.sales ?? item.total_amount ?? 0
            ),
            staff_name:
              typeof item.staff_name === "string" ? item.staff_name : null,
          };
        })
        .filter((item) => item !== null) as {
        id: string;
        visit_date: string | null;
        price: number;
        staff_name: string | null;
      }[];

      setMonthlyStaffVisits(monthlyStaffRows);
      const expenses = (expensesResult.data ?? []) as ExpenseRow[];

      const map = new Map<string, Row>();
      const now = new Date();

      for (let i = 11; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
        map.set(key, { month: key, sales: 0, expenses: 0, profit: 0 });
      }

      visits.forEach((v) => {
        const d =
          getDateValue(v, ["visit_date", "date", "visited_at", "created_at"]) ?? null;
        if (!d) return;

        const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
        if (!map.has(key)) return;

        map.get(key)!.sales += toSafeNumber(
          v.price ?? v.amount ?? v.sales ?? v.total_amount ?? 0
        );
      });

      expenses.forEach((e) => {
        const d =
          getDateValue(e, [
            "expense_date",
            "date",
            "used_at",
            "payment_date",
            "created_at",
          ]) ?? null;
        if (!d) return;

        const amount = toSafeNumber(
          e.amount ?? e.price ?? e.expense_amount ?? e.total_amount ?? 0
        );

        const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
        if (!map.has(key)) return;

        map.get(key)!.expenses += amount;
      });

      const arr = Array.from(map.values()).map((r) => ({
        ...r,
        profit: r.sales - r.expenses,
      }));

      setRows(arr);

      if (arr.some((row) => row.month === currentMonth)) {
        setSelectedMonth(currentMonth);
        setQuickSelectMode("current");
      } else if (arr.length > 0) {
        setSelectedMonth(arr[arr.length - 1].month);
        setQuickSelectMode("custom");
      }
    }

    void load();
  }, []);

  useEffect(() => {
    const seen = localStorage.getItem("onboarding_done");
    if (!seen) {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    if (isDemo) {
      setSelectedMonth(demoRows[demoRows.length - 1].month);
      setQuickSelectMode("custom");
      setGeneratedReportMessage("デモデータを表示中です");
      setMonthlySummary(null);
      return;
    }

    const currentMonth = getCurrentMonthValue();
    if (rows.some((row) => row.month === currentMonth)) {
      setSelectedMonth(currentMonth);
      setQuickSelectMode("current");
    } else if (rows.length > 0) {
      setSelectedMonth(rows[rows.length - 1].month);
      setQuickSelectMode("custom");
    }

    setGeneratedReportMessage("");
    setMonthlySummary(null);
  }, [isDemo, rows]);

  function handleCloseOnboarding() {
    localStorage.setItem("onboarding_done", "1");
    setShowOnboarding(false);
  }

  const displayRows = isDemo ? demoRows : rows;

  const staffSalesRows = useMemo(() => {
    const map = new Map<string, { name: string; sales: number; count: number }>();

    monthlyStaffVisits.forEach((visit) => {
      const name =
        visit.staff_name && visit.staff_name.trim().length > 0
          ? visit.staff_name.trim()
          : "担当未設定";

      const prev = map.get(name) ?? { name, sales: 0, count: 0 };

      map.set(name, {
        name,
        sales: prev.sales + visit.price,
        count: prev.count + 1,
      });
    });

    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [monthlyStaffVisits]);

    const total = useMemo(() => {
    return displayRows.reduce(
      (a, b) => ({
        sales: a.sales + b.sales,
        expenses: a.expenses + b.expenses,
        profit: a.profit + b.profit,
      }),
      { sales: 0, expenses: 0, profit: 0 }
    );
  }, [displayRows]);

  const cur = displayRows[displayRows.length - 1];
  const prev = displayRows[displayRows.length - 2];

  const salesRate = cur && prev ? rate(cur.sales, prev.sales) : 0;
  const expRate = cur && prev ? rate(cur.expenses, prev.expenses) : 0;
  const profitRate = cur && prev ? rate(cur.profit, prev.profit) : 0;

  const comment = buildComment(cur, prev);
  const danger = getDangerLevel(cur, prev);

  const alertBoxClass =
    comment.tone === "danger"
      ? "border-red-200 bg-red-50"
      : comment.tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : comment.tone === "good"
      ? "border-green-200 bg-green-50"
      : "border-slate-200 bg-slate-50";

  const selectedMonthLabel = selectedMonth ? getMonthLabel(selectedMonth) : "未選択";
  const canExport = Boolean(selectedMonth);

  const currentMonthValue = getCurrentMonthValue();
  const previousMonthValue = getPreviousMonthValue(currentMonthValue);

  const hasCurrentMonth = displayRows.some((row) => row.month === currentMonthValue);
  const hasPreviousMonth = displayRows.some((row) => row.month === previousMonthValue);

  async function handleGenerateReport() {
    if (!selectedMonth) return;

    setIsGeneratingReport(true);
    setGeneratedReportMessage("");

    try {
      if (isDemo) {
        const summary = demoSummaryMap[selectedMonth] ?? {
          month: selectedMonth,
          totalSales: 0,
          totalExpenses: 0,
          profit: 0,
          visitCount: 0,
          avgUnitPrice: 0,
          expenseCount: 0,
          categoryRows: [],
        };

        setMonthlySummary(summary);
        setGeneratedReportMessage(
          `デモ生成OK：売上 ${yen(summary.totalSales ?? 0)} / 経費 ${yen(
            summary.totalExpenses ?? 0
          )} / 粗利 ${yen(summary.profit ?? 0)}`
        );
        return;
      }

      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month: selectedMonth }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "レポート生成に失敗しました");
      }

      const summary: MonthlySummary = {
        ...(data?.data ?? {}),
        month: selectedMonth,
      };

      setMonthlySummary(summary);

      setGeneratedReportMessage(
        `生成OK：売上 ${yen(summary?.totalSales ?? 0)} / 経費 ${yen(
          summary?.totalExpenses ?? 0
        )} / 粗利 ${yen(summary?.profit ?? 0)}`
      );
    } catch (error) {
      console.error("generate-report error:", error);
      setMonthlySummary(null);
      setGeneratedReportMessage(
        error instanceof Error ? error.message : "レポート生成に失敗しました"
      );
    } finally {
      setIsGeneratingReport(false);
    }
  }

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

  function handleCustomMonthChange(month: string) {
    setSelectedMonth(month);

    if (month === currentMonthValue) {
      setQuickSelectMode("current");
      return;
    }

    if (month === previousMonthValue) {
      setQuickSelectMode("previous");
      return;
    }

    setQuickSelectMode("custom");
  }

  return (
    <div className="space-y-6 p-4 pb-24">
      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide">
              Naily AiDOL 経営ダッシュボード
            </div>
            <h1 className="text-3xl font-bold leading-tight">
              今月の利益と課題が、すぐわかる。
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-200">
              売上・経費・粗利・前月比・経費カテゴリまで自動で整理。
              オーナーがすぐ判断できる月次レポートを、そのまま確認・保存・共有できます。
            </p>

            <div className="mt-5 flex flex-wrap gap-2 text-xs">
                            {currentStaff ? (
                <span className="rounded-full bg-white/10 px-3 py-1">
                  表示範囲: {currentStaff.role === "staff" ? "自分のみ" : "店舗全体"} / {currentStaff.name ?? "未設定"}
                </span>
              ) : null}
              <span className="rounded-full bg-white/10 px-3 py-1">
                出力対象: {selectedMonthLabel}
              </span>
              <span className={`rounded-full px-3 py-1 font-bold ${danger.badgeClass}`}>
                今月の経営リスク: {danger.label}
              </span>
              {isDemo ? (
                <span className="rounded-full bg-blue-500/20 px-3 py-1 font-bold text-blue-100">
                  デモ表示中
                </span>
              ) : null}
            </div>
          </div>

          <div className="w-full max-w-md rounded-2xl bg-white/10 p-4 backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-bold">今月の注意度</div>
              <div className="text-sm font-bold">{danger.score} / 100</div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full ${danger.barClass}`}
                style={{ width: `${danger.score}%` }}
              />
            </div>
            <div className="mt-3 text-xs leading-6 text-slate-200">
              売上・経費・粗利の変化から、今月どれくらい注意が必要かを簡易表示しています。
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-bold text-slate-900">
                今月の経営レポートを確認
              </div>
              <div className="mt-1 text-sm text-slate-500">
                月を選んでレポート生成後、そのままPDFで確認・保存・共有できます。
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDemo(true)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-blue-500"
              >
                デモ表示
              </button>

              <button
                type="button"
                onClick={() => setIsDemo(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow hover:bg-slate-50"
              >
                実データ
              </button>

              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={!canExport || isGeneratingReport}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow hover:bg-slate-50 disabled:opacity-50"
              >
                {isGeneratingReport ? "生成中..." : "レポート生成"}
              </button>

              {monthlySummary ? (
                <PdfPreviewModal>
                  <MonthlyReportPdf summary={monthlySummary} rows={displayRows} />
                </PdfPreviewModal>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-xl bg-slate-300 px-4 py-2 text-sm font-bold text-white shadow disabled:cursor-not-allowed"
                >
                  レポートを確認
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">この画面でわかること</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                売上 / 経費 / 粗利
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">レポートで見えること</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                KPI / 前月比 / 経費分析
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">活用できること</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                確認 / 保存 / 共有
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            {generatedReportMessage ? (
              <span className="font-medium text-slate-800">{generatedReportMessage}</span>
            ) : isDemo ? (
              <span>
                デモ表示中です。「レポート生成」を押すと、完成イメージの月次レポートを確認できます。
              </span>
            ) : (
              <span>
                月を選んで「レポート生成」を押すと、その月の経営レポートをPDFで確認できます。
              </span>
            )}
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">レポート対象月</div>
            <div className="mt-1 text-sm text-slate-500">
              よく使う月はワンタップで切り替えできます。
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleQuickSelect("current")}
              disabled={!hasCurrentMonth}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
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
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
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
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
                quickSelectMode === "custom"
                  ? "bg-blue-600 text-white"
                  : "border bg-white text-slate-700"
              }`}
            >
              任意月
            </button>
          </div>

          {quickSelectMode === "custom" ? (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                任意月を選択
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => handleCustomMonthChange(e.target.value)}
                className="w-full rounded-xl border bg-white px-3 py-2"
              >
                {displayRows.map((row) => (
                  <option key={row.month} value={row.month}>
                    {getMonthLabel(row.month)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="text-sm text-slate-500">現在の選択</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {selectedMonthLabel}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              ここで選んだ月が、そのまま月次レポートの出力対象になります。
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="text-sm text-slate-500">売上 合計</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{yen(total.sales)}</div>
          <div className="mt-2 text-sm text-slate-500">
            売上の流れをまとめて把握
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="text-sm text-slate-500">経費 合計</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{yen(total.expenses)}</div>
          <div className="mt-2 text-sm text-slate-500">
            コストの増減を継続チェック
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="text-sm text-slate-500">粗利 合計</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{yen(total.profit)}</div>
          <div className="mt-2 text-sm text-slate-500">
            利益が残っているかを把握
          </div>
        </div>
      </div>

      <div className={`rounded-3xl border p-5 shadow ${alertBoxClass}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-slate-900">
              今月、優先して確認したいポイント
            </div>
            <div className="mt-1 text-sm text-slate-600">
              前月比から見た、今月の改善ポイントです。
            </div>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-bold ${danger.badgeClass}`}>
            注意度 {danger.label}
          </div>
        </div>

        <div className="font-bold text-slate-900">{comment.title}</div>
        <div className="mt-2 text-sm leading-7 text-slate-700">{comment.body}</div>

        {cur && prev ? (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-sm text-slate-500">売上 前月比</div>
              <div className={`mt-2 text-2xl font-bold ${getRateColor(salesRate, "sales")}`}>
                {arrow(salesRate)} {salesRate >= 0 ? "+" : ""}
                {salesRate.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {changeLabel(salesRate, "sales")}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-sm text-slate-500">経費 前月比</div>
              <div className={`mt-2 text-2xl font-bold ${getRateColor(expRate, "expenses")}`}>
                {arrow(expRate)} {expRate >= 0 ? "+" : ""}
                {expRate.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {changeLabel(expRate, "expenses")}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-sm text-slate-500">粗利 前月比</div>
              <div className={`mt-2 text-2xl font-bold ${getRateColor(profitRate, "profit")}`}>
                {arrow(profitRate)} {profitRate >= 0 ? "+" : ""}
                {profitRate.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {changeLabel(profitRate, "profit")}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border bg-white p-5 shadow">
        <div className="mb-4">
          <div className="text-lg font-bold text-slate-900">月次推移グラフ</div>
          <div className="mt-1 text-sm text-slate-500">
            売上・経費・粗利の流れを一目で確認できます。
          </div>
        </div>
                    {!isDemo && currentStaff?.role !== "staff" ? (
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">スタッフ別売上</div>
            <div className="mt-1 text-sm text-slate-500">
              今月の担当別売上と来店件数です。
            </div>
          </div>

          {staffSalesRows.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              今月のスタッフ別データはありません。
            </div>
          ) : (
            <div className="space-y-3">
              {staffSalesRows.map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between rounded-2xl border bg-slate-50 p-4"
                >
                  <div>
                    <div className="font-bold text-slate-900">{row.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      来店 {row.count}件
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-bold text-slate-900">
                      {yen(row.sales)}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      客単価 {row.count > 0 ? yen(row.sales / row.count) : yen(0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!isDemo && currentStaff?.role === "staff" ? (
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">自分の実績</div>
            <div className="mt-1 text-sm text-slate-500">
              今月の自分の売上と来店件数です。
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">担当者</div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {currentStaff.name ?? "未設定"}
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">来店件数</div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {monthlyStaffVisits.length}件
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">担当売上</div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {yen(monthlyStaffVisits.reduce((sum, item) => sum + item.price, 0))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

        <div className="h-[320px]">
          <ResponsiveContainer>
            <LineChart data={displayRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip
                formatter={(value, name) => [yen(toSafeNumber(value)), String(name)]}
                labelFormatter={(label) => `月: ${String(label)}`}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 13,
                }}
              />
              <Line
                type="monotone"
                dataKey="sales"
                name="売上"
                stroke="#2563eb"
                strokeWidth={4}
                dot={{ r: 4 }}
                activeDot={{ r: 7 }}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                name="経費"
                stroke="#ef4444"
                strokeWidth={4}
                dot={{ r: 4 }}
                activeDot={{ r: 7 }}
              />
              <Line
                type="monotone"
                dataKey="profit"
                name="粗利"
                stroke="#16a34a"
                strokeWidth={4}
                dot={{ r: 4 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

          {showOnboarding && <Onboarding onClose={handleCloseOnboarding} />}
    </div>
  );
}