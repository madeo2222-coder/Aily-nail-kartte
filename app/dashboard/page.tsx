"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

type SummaryPaymentMethodRow = {
  paymentMethod: string;
  amount: number;
  percent: number;
  type: "cash" | "cashless" | "point" | "other";
};

type DisplayPaymentMethodRow = {
  method: string;
  amount: number;
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
  cashSales?: number;
  cashlessSales?: number;
  pointSales?: number;
  paymentMethodRows?: SummaryPaymentMethodRow[];
};

type StaffRole = "owner" | "manager" | "staff";

type CurrentStaff = {
  id: string;
  salon_id: string | null;
  name: string | null;
  role: StaffRole | null;
  user_id: string | null;
};

type MonthlyStaffVisit = {
  id: string;
  visit_date: string | null;
  price: number;
  staff_name: string | null;
};

type StaffOptionRow = {
  name: string | null;
};

type VisitPaymentRow = {
  id: string;
  visit_id: string;
  payment_method: string | null;
  amount: number | null;
  sort_order: number | null;
  created_at?: string | null;
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

function getMonthValueFromDate(date: Date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}`;
}

function getPreviousMonthValue(value: string) {
  const [yearText, monthText] = value.split("/");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return "";
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}/${date.getMonth() + 1}`;
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

function getRankBadgeClass(rank: number) {
  if (rank === 0) return "bg-amber-400 text-white";
  if (rank === 1) return "bg-slate-400 text-white";
  if (rank === 2) return "bg-orange-400 text-white";
  return "bg-slate-900 text-white";
}

function getScopeLabel(staff: CurrentStaff | null, selectedStaffFilter: string) {
  if (!staff?.role) return "未判定";

  if (staff.role === "staff") {
    return "自分のみ";
  }

  if (selectedStaffFilter === "all") {
    return staff.role === "manager" ? "店舗全体（店長）" : "店舗全体（オーナー）";
  }

  return `担当者指定（${selectedStaffFilter}）`;
}

function getTargetLabel(selectedStaffFilter: string, isStaffRole: boolean) {
  if (isStaffRole) return "自分";
  if (selectedStaffFilter === "all") return "全体";
  return selectedStaffFilter;
}

function aggregateRows(
  visits: VisitRow[],
  expenses: ExpenseRow[],
  selectedStaffFilter: string,
  baseDate: Date | null
) {
  if (!baseDate) return [] as Row[];

  const map = new Map<string, Row>();

  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
    map.set(key, { month: key, sales: 0, expenses: 0, profit: 0 });
  }

  visits.forEach((v) => {
    const d =
      getDateValue(v, ["visit_date", "date", "visited_at", "created_at"]) ?? null;
    if (!d) return;

    const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
    if (!map.has(key)) return;

    const staffName =
      typeof v.staff_name === "string" && v.staff_name.trim().length > 0
        ? v.staff_name.trim()
        : "担当未設定";

    if (selectedStaffFilter !== "all" && staffName !== selectedStaffFilter) {
      return;
    }

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

    const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
    if (!map.has(key)) return;

    map.get(key)!.expenses += toSafeNumber(
      e.amount ?? e.price ?? e.expense_amount ?? e.total_amount ?? 0
    );
  });

  return Array.from(map.values()).map((r) => ({
    ...r,
    profit: r.sales - r.expenses,
  }));
}

function isCashlessMethod(method: string) {
  const text = method.trim();
  if (!text) return false;
  if (text === "現金") return false;
  if (text === "ホットペッパーポイント") return false;
  return true;
}

function toSummaryPaymentType(
  method: string
): "cash" | "cashless" | "point" | "other" {
  if (method === "現金") return "cash";
  if (method === "ホットペッパーポイント") return "point";
  if (isCashlessMethod(method)) return "cashless";
  return "other";
}

function totalPriceSafe(rows: { amount: number }[]) {
  return rows.reduce((sum, row) => sum + row.amount, 0);
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
    cashSales: 50000,
    cashlessSales: 120000,
    pointSales: 10000,
    paymentMethodRows: [
      {
        paymentMethod: "クレジットカード",
        amount: 70000,
        percent: 38.9,
        type: "cashless",
      },
      {
        paymentMethod: "現金",
        amount: 50000,
        percent: 27.8,
        type: "cash",
      },
      {
        paymentMethod: "PayPay",
        amount: 50000,
        percent: 27.8,
        type: "cashless",
      },
      {
        paymentMethod: "ホットペッパーポイント",
        amount: 10000,
        percent: 5.6,
        type: "point",
      },
    ],
  },
};

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [baseDate, setBaseDate] = useState<Date | null>(null);

  const [visitsData, setVisitsData] = useState<VisitRow[]>([]);
  const [expensesData, setExpensesData] = useState<ExpenseRow[]>([]);
  const [visitPaymentsData, setVisitPaymentsData] = useState<VisitPaymentRow[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [quickSelectMode, setQuickSelectMode] =
    useState<QuickSelectMode>("current");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generatedReportMessage, setGeneratedReportMessage] = useState("");
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(
    null
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<CurrentStaff | null>(null);

  useEffect(() => {
    setMounted(true);
    setBaseDate(new Date());
  }, []);

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
      let visitPaymentsQuery = supabase.from("visit_payments").select("*");
      let staffsQuery = supabase.from("staffs").select("name");

      if (staffRow?.salon_id) {
        visitsQuery = visitsQuery.eq("salon_id", staffRow.salon_id);
        expensesQuery = expensesQuery.eq("salon_id", staffRow.salon_id);
        visitPaymentsQuery = visitPaymentsQuery.eq("salon_id", staffRow.salon_id);
        staffsQuery = staffsQuery.eq("salon_id", staffRow.salon_id);
      }

      if (staffRow?.role === "staff" && staffRow.name) {
        visitsQuery = visitsQuery.eq("staff_name", staffRow.name);
      }

      const [visitsResult, expensesResult, visitPaymentsResult, staffsResult] =
        await Promise.all([
          visitsQuery,
          expensesQuery,
          visitPaymentsQuery,
          staffsQuery,
        ]);

      if (visitsResult.error) {
        console.error("visits fetch error:", visitsResult.error);
      }

      if (expensesResult.error) {
        console.error("expenses fetch error:", expensesResult.error);
      }

      if (visitPaymentsResult.error) {
        console.error("visit_payments fetch error:", visitPaymentsResult.error);
      }

      if (staffsResult.error) {
        console.error("staffs list fetch error:", staffsResult.error);
      }

      const visits = (visitsResult.data ?? []) as VisitRow[];
      const expenses = (expensesResult.data ?? []) as ExpenseRow[];
      const visitPayments = (visitPaymentsResult.data ?? []) as VisitPaymentRow[];
      const staffRows = (staffsResult.data ?? []) as StaffOptionRow[];

      setVisitsData(visits);
      setExpensesData(expenses);
      setVisitPaymentsData(visitPayments);

      const nameSet = new Set<string>();

      staffRows.forEach((row) => {
        if (typeof row.name === "string" && row.name.trim().length > 0) {
          nameSet.add(row.name.trim());
        }
      });

      visits.forEach((row) => {
        if (typeof row.staff_name === "string" && row.staff_name.trim().length > 0) {
          nameSet.add(row.staff_name.trim());
        }
      });

      setStaffOptions(Array.from(nameSet).sort((a, b) => a.localeCompare(b, "ja")));

      if (staffRow?.role === "staff" && staffRow.name) {
        setSelectedStaffFilter(staffRow.name);
      } else {
        setSelectedStaffFilter("all");
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const seen = localStorage.getItem("onboarding_done");
    if (!seen) {
      setShowOnboarding(true);
    }
  }, [mounted]);

  const effectiveStaffFilter =
    currentStaff?.role === "staff" ? currentStaff.name ?? "all" : selectedStaffFilter;

  const currentMonthValue = useMemo(() => {
    return baseDate ? getMonthValueFromDate(baseDate) : "";
  }, [baseDate]);

  const previousMonthValue = useMemo(() => {
    return currentMonthValue ? getPreviousMonthValue(currentMonthValue) : "";
  }, [currentMonthValue]);

  const rows = useMemo(() => {
    return aggregateRows(visitsData, expensesData, effectiveStaffFilter, baseDate);
  }, [visitsData, expensesData, effectiveStaffFilter, baseDate]);

  useEffect(() => {
    if (!mounted) return;

    if (isDemo) {
      setSelectedMonth(demoRows[demoRows.length - 1].month);
      setQuickSelectMode("custom");
      setGeneratedReportMessage("デモデータを表示中です");
      setMonthlySummary(null);
      return;
    }

    if (!currentMonthValue) return;

    if (rows.some((row) => row.month === currentMonthValue)) {
      setSelectedMonth(currentMonthValue);
      setQuickSelectMode("current");
    } else if (rows.length > 0) {
      setSelectedMonth(rows[rows.length - 1].month);
      setQuickSelectMode("custom");
    } else {
      setSelectedMonth("");
      setQuickSelectMode("custom");
    }

    setGeneratedReportMessage("");
    setMonthlySummary(null);
  }, [mounted, isDemo, rows, currentMonthValue, effectiveStaffFilter]);

  function handleCloseOnboarding() {
    localStorage.setItem("onboarding_done", "1");
    setShowOnboarding(false);
  }

  const displayRows = isDemo ? demoRows : rows;

  const monthlyStaffVisits = useMemo(() => {
    if (isDemo || !baseDate) return [] as MonthlyStaffVisit[];

    const currentYear = baseDate.getFullYear();
    const currentMonthNumber = baseDate.getMonth() + 1;

    const result: MonthlyStaffVisit[] = [];

    visitsData.forEach((item) => {
      const rawDate =
        (item.visit_date as string | null) ??
        (item.date as string | null) ??
        (item.visited_at as string | null) ??
        (item.created_at as string | null) ??
        null;

      if (!rawDate) return;

      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) return;

      if (
        parsed.getFullYear() !== currentYear ||
        parsed.getMonth() + 1 !== currentMonthNumber
      ) {
        return;
      }

      const staffName =
        typeof item.staff_name === "string" && item.staff_name.trim().length > 0
          ? item.staff_name.trim()
          : "担当未設定";

      if (effectiveStaffFilter !== "all" && staffName !== effectiveStaffFilter) {
        return;
      }

      result.push({
        id: String(item.id ?? ""),
        visit_date: rawDate,
        price: toSafeNumber(
          item.price ?? item.amount ?? item.sales ?? item.total_amount ?? 0
        ),
        staff_name: staffName,
      });
    });

    return result;
  }, [visitsData, effectiveStaffFilter, isDemo, baseDate]);

  const currentMonthVisitIdSet = useMemo(() => {
    return new Set(monthlyStaffVisits.map((visit) => visit.id));
  }, [monthlyStaffVisits]);

  const currentMonthPaymentRows = useMemo(() => {
    if (isDemo) return [] as VisitPaymentRow[];

    return visitPaymentsData.filter((row) => {
      if (!row.visit_id) return false;
      return currentMonthVisitIdSet.has(String(row.visit_id));
    });
  }, [visitPaymentsData, currentMonthVisitIdSet, isDemo]);

  const paymentMethodRows = useMemo<DisplayPaymentMethodRow[]>(() => {
    const map = new Map<string, number>();

    currentMonthPaymentRows.forEach((row) => {
      const method =
        typeof row.payment_method === "string" && row.payment_method.trim().length > 0
          ? row.payment_method.trim()
          : "未設定";
      const amount = toSafeNumber(row.amount ?? 0);
      map.set(method, (map.get(method) ?? 0) + amount);
    });

    return Array.from(map.entries())
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [currentMonthPaymentRows]);

  const cashSales = useMemo(() => {
    if (isDemo && selectedMonth === "2025/11") {
      return demoSummaryMap["2025/11"]?.cashSales ?? 0;
    }
    const target = paymentMethodRows.find((row) => row.method === "現金");
    return target?.amount ?? 0;
  }, [paymentMethodRows, isDemo, selectedMonth]);

  const pointSales = useMemo(() => {
    if (isDemo && selectedMonth === "2025/11") {
      return demoSummaryMap["2025/11"]?.pointSales ?? 0;
    }
    const target = paymentMethodRows.find(
      (row) => row.method === "ホットペッパーポイント"
    );
    return target?.amount ?? 0;
  }, [paymentMethodRows, isDemo, selectedMonth]);

  const cashlessSales = useMemo(() => {
    if (isDemo && selectedMonth === "2025/11") {
      return demoSummaryMap["2025/11"]?.cashlessSales ?? 0;
    }
    return paymentMethodRows
      .filter((row) => isCashlessMethod(row.method))
      .reduce((sum, row) => sum + row.amount, 0);
  }, [paymentMethodRows, isDemo, selectedMonth]);

  const paymentCount = currentMonthPaymentRows.length;

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

  const myMonthlySales = useMemo(() => {
    return monthlyStaffVisits.reduce((sum, item) => sum + item.price, 0);
  }, [monthlyStaffVisits]);

  const currentFilteredVisitCount = monthlyStaffVisits.length;
  const currentFilteredAvgUnitPrice =
    currentFilteredVisitCount > 0 ? myMonthlySales / currentFilteredVisitCount : 0;

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

  const hasCurrentMonth = currentMonthValue
    ? displayRows.some((row) => row.month === currentMonthValue)
    : false;

  const hasPreviousMonth = previousMonthValue
    ? displayRows.some((row) => row.month === previousMonthValue)
    : false;

  const targetLabel = getTargetLabel(
    selectedStaffFilter,
    currentStaff?.role === "staff"
  );

  const selectedMonthRow = useMemo(() => {
    return displayRows.find((row) => row.month === selectedMonth);
  }, [displayRows, selectedMonth]);

  const selectedMonthExpenseRows = useMemo(() => {
    if (!selectedMonth || isDemo) return [] as ExpenseRow[];

    return expensesData.filter((item) => {
      const d =
        getDateValue(item, [
          "expense_date",
          "date",
          "used_at",
          "payment_date",
          "created_at",
        ]) ?? null;
      if (!d) return false;
      const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
      return key === selectedMonth;
    });
  }, [expensesData, selectedMonth, isDemo]);

  const selectedMonthVisitRows = useMemo(() => {
    if (!selectedMonth || isDemo) return [] as VisitRow[];

    return visitsData.filter((item) => {
      const d =
        getDateValue(item, ["visit_date", "date", "visited_at", "created_at"]) ?? null;
      if (!d) return false;

      const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
      if (key !== selectedMonth) return false;

      const staffName =
        typeof item.staff_name === "string" && item.staff_name.trim().length > 0
          ? item.staff_name.trim()
          : "担当未設定";

      if (effectiveStaffFilter !== "all" && staffName !== effectiveStaffFilter) {
        return false;
      }

      return true;
    });
  }, [visitsData, selectedMonth, effectiveStaffFilter, isDemo]);

  const selectedMonthVisitIdSet = useMemo(() => {
    return new Set(
      selectedMonthVisitRows
        .map((row) => String(row.id ?? ""))
        .filter((id) => id.length > 0)
    );
  }, [selectedMonthVisitRows]);

  const selectedMonthPaymentRows = useMemo(() => {
    if (isDemo) return [] as VisitPaymentRow[];

    return visitPaymentsData.filter((row) => selectedMonthVisitIdSet.has(String(row.visit_id)));
  }, [visitPaymentsData, selectedMonthVisitIdSet, isDemo]);

  const selectedMonthCategoryRows = useMemo(() => {
    if (isDemo && selectedMonth === "2025/11") {
      return demoSummaryMap["2025/11"]?.categoryRows ?? [];
    }

    const map = new Map<string, number>();
    const totalExpensesValue = selectedMonthExpenseRows.reduce(
      (sum, row) => sum + toSafeNumber(row.amount ?? 0),
      0
    );

    selectedMonthExpenseRows.forEach((row) => {
      const rawCategory = row.category;
      const category =
        typeof rawCategory === "string" && rawCategory.trim().length > 0
          ? rawCategory.trim()
          : "未分類";
      const amount = toSafeNumber(row.amount ?? 0);
      map.set(category, (map.get(category) ?? 0) + amount);
    });

    return Array.from(map.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percent: totalExpensesValue > 0 ? (amount / totalExpensesValue) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [selectedMonthExpenseRows, isDemo, selectedMonth]);

  const selectedMonthPaymentMethodRows = useMemo<DisplayPaymentMethodRow[]>(() => {
    if (isDemo && selectedMonth === "2025/11") {
      return (demoSummaryMap["2025/11"]?.paymentMethodRows ?? []).map((row) => ({
        method: row.paymentMethod,
        amount: row.amount,
      }));
    }

    const map = new Map<string, number>();

    selectedMonthPaymentRows.forEach((row) => {
      const method =
        typeof row.payment_method === "string" && row.payment_method.trim().length > 0
          ? row.payment_method.trim()
          : "未設定";
      const amount = toSafeNumber(row.amount ?? 0);
      map.set(method, (map.get(method) ?? 0) + amount);
    });

    return Array.from(map.entries())
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [selectedMonthPaymentRows, isDemo, selectedMonth]);

  const selectedMonthSummaryPaymentRows = useMemo<SummaryPaymentMethodRow[]>(() => {
    const totalAmount = totalPriceSafe(selectedMonthPaymentMethodRows);

    return selectedMonthPaymentMethodRows.map((row) => ({
      paymentMethod: row.method,
      amount: row.amount,
      percent: totalAmount > 0 ? (row.amount / totalAmount) * 100 : 0,
      type: toSummaryPaymentType(row.method),
    }));
  }, [selectedMonthPaymentMethodRows]);

  const selectedMonthCashSales = useMemo(() => {
    if (isDemo && selectedMonth === "2025/11") {
      return demoSummaryMap["2025/11"]?.cashSales ?? 0;
    }
    return (
      selectedMonthPaymentMethodRows.find((row) => row.method === "現金")?.amount ?? 0
    );
  }, [selectedMonthPaymentMethodRows, isDemo, selectedMonth]);

  const selectedMonthPointSales = useMemo(() => {
    if (isDemo && selectedMonth === "2025/11") {
      return demoSummaryMap["2025/11"]?.pointSales ?? 0;
    }
    return (
      selectedMonthPaymentMethodRows.find(
        (row) => row.method === "ホットペッパーポイント"
      )?.amount ?? 0
    );
  }, [selectedMonthPaymentMethodRows, isDemo, selectedMonth]);

  const selectedMonthCashlessSales = useMemo(() => {
    if (isDemo && selectedMonth === "2025/11") {
      return demoSummaryMap["2025/11"]?.cashlessSales ?? 0;
    }
    return selectedMonthPaymentMethodRows
      .filter((row) => isCashlessMethod(row.method))
      .reduce((sum, row) => sum + row.amount, 0);
  }, [selectedMonthPaymentMethodRows, isDemo, selectedMonth]);

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
          cashSales: 0,
          cashlessSales: 0,
          pointSales: 0,
          paymentMethodRows: [],
        };

        setMonthlySummary(summary);
        setGeneratedReportMessage(
          `デモ生成OK：売上 ${yen(summary.totalSales ?? 0)} / 経費 ${yen(
            summary.totalExpenses ?? 0
          )} / 粗利 ${yen(summary.profit ?? 0)}`
        );
        return;
      }

      if (effectiveStaffFilter !== "all") {
        const targetRow = displayRows.find((row) => row.month === selectedMonth);

        const monthVisits = visitsData.filter((item) => {
          const d =
            getDateValue(item, ["visit_date", "date", "visited_at", "created_at"]) ??
            null;
          if (!d) return false;

          const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
          if (key !== selectedMonth) return false;

          const staffName =
            typeof item.staff_name === "string" && item.staff_name.trim().length > 0
              ? item.staff_name.trim()
              : "担当未設定";

          return staffName === effectiveStaffFilter;
        });

        const monthExpenseCount = expensesData.filter((item) => {
          const d =
            getDateValue(item, [
              "expense_date",
              "date",
              "used_at",
              "payment_date",
              "created_at",
            ]) ?? null;
          if (!d) return false;
          const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
          return key === selectedMonth;
        }).length;

        const summary: MonthlySummary = {
          month: selectedMonth,
          totalSales: targetRow?.sales ?? 0,
          totalExpenses: targetRow?.expenses ?? 0,
          profit: targetRow?.profit ?? 0,
          visitCount: monthVisits.length,
          avgUnitPrice:
            monthVisits.length > 0 ? (targetRow?.sales ?? 0) / monthVisits.length : 0,
          expenseCount: monthExpenseCount,
          categoryRows: selectedMonthCategoryRows,
          cashSales: selectedMonthCashSales,
          cashlessSales: selectedMonthCashlessSales,
          pointSales: selectedMonthPointSales,
          paymentMethodRows: selectedMonthSummaryPaymentRows,
        };

        setMonthlySummary(summary);
        setGeneratedReportMessage(
          `担当者別生成OK：${effectiveStaffFilter} / 売上 ${yen(
            summary.totalSales ?? 0
          )} / 経費 ${yen(summary.totalExpenses ?? 0)} / 粗利 ${yen(
            summary.profit ?? 0
          )}`
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
        `生成OK：売上 ${yen(summary.totalSales ?? 0)} / 経費 ${yen(
          summary.totalExpenses ?? 0
        )} / 粗利 ${yen(summary.profit ?? 0)}`
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

  function handleExportMonthlyCsv() {
    if (!selectedMonth) return;

    const summaryRows: (string | number)[][] = [
      ["区分", "項目", "値"],
      ["基本情報", "対象月", selectedMonthLabel],
      ["基本情報", "表示対象", targetLabel],
      ["基本情報", "出力日", new Date().toLocaleDateString("ja-JP")],
      ["月次集計", "売上合計", selectedMonthRow?.sales ?? 0],
      ["月次集計", "経費合計", selectedMonthRow?.expenses ?? 0],
      ["月次集計", "粗利", selectedMonthRow?.profit ?? 0],
      ["月次集計", "来店件数", selectedMonthVisitRows.length],
      ["月次集計", "経費件数", selectedMonthExpenseRows.length],
      [
        "月次集計",
        "客単価",
        selectedMonthVisitRows.length > 0
          ? Math.round((selectedMonthRow?.sales ?? 0) / selectedMonthVisitRows.length)
          : 0,
      ],
      ["支払い集計", "現金", selectedMonthCashSales],
      ["支払い集計", "キャッシュレス合計", selectedMonthCashlessSales],
      ["支払い集計", "ホットペッパーポイント", selectedMonthPointSales],
      [],
      ["経費カテゴリ別", "カテゴリ", "金額", "構成比"],
      ...selectedMonthCategoryRows.map((row) => [
        "経費カテゴリ別",
        row.category,
        row.amount,
        `${row.percent.toFixed(1)}%`,
      ]),
      [],
      ["支払い手段別", "支払い手段", "金額", "構成比"],
      ...selectedMonthPaymentMethodRows.map((row) => [
        "支払い手段別",
        row.method,
        row.amount,
        totalPriceSafe(selectedMonthPaymentMethodRows) > 0
          ? `${((row.amount / totalPriceSafe(selectedMonthPaymentMethodRows)) * 100).toFixed(
              1
            )}%`
          : "0.0%",
      ]),
    ];

    downloadCsv(`monthly-summary-${selectedMonth.replace("/", "-")}.csv`, summaryRows);
  }

  function handleQuickSelect(mode: QuickSelectMode) {
    if (mode === "current" && hasCurrentMonth && currentMonthValue) {
      setSelectedMonth(currentMonthValue);
      setQuickSelectMode("current");
      return;
    }

    if (mode === "previous" && hasPreviousMonth && previousMonthValue) {
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
    <div className="space-y-5 p-4 pb-24 md:space-y-6" suppressHydrationWarning>
      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide">
              Naily AiDOL 経営ダッシュボード
            </div>
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">
              今月の利益と課題が、すぐわかる。
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-200 md:text-base">
              売上・経費・粗利・前月比・経費カテゴリまで自動で整理。
              オーナーがすぐ判断できる月次レポートを、そのまま確認・保存・共有できます。
            </p>

            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              {currentStaff ? (
                <span className="rounded-full bg-white/10 px-3 py-1">
                  表示範囲: {getScopeLabel(currentStaff, selectedStaffFilter)} /{" "}
                  {currentStaff.name ?? "未設定"}
                </span>
              ) : null}
              <span className="rounded-full bg-white/10 px-3 py-1">
                出力対象: {selectedMonthLabel}
              </span>
              <span className={`rounded-full px-3 py-1 font-bold ${danger.badgeClass}`}>
                今月の経営リスク: {danger.label}
              </span>
              {effectiveStaffFilter !== "all" && currentStaff?.role !== "staff" ? (
                <span className="rounded-full bg-blue-500/20 px-3 py-1 font-bold text-blue-100">
                  表示中: {effectiveStaffFilter}
                </span>
              ) : null}
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

      <div className="rounded-3xl border bg-white p-5 shadow">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900">月次締め・税理士提出</div>
            <div className="mt-1 text-sm text-slate-500">
              提出準備・チェック・文面作成は専用ページにまとめました。
            </div>
          </div>

          <Link
            href="/tax"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow hover:bg-slate-800"
          >
            税理士提出ページへ
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm text-slate-500">この画面でやること</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              月次PDF / 月次総合CSV
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm text-slate-500">専用ページでやること</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              提出チェック / 文面 / 保存
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm text-slate-500">別ページで出すもの</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              売上明細CSV / 経費明細CSV
            </div>
          </div>
        </div>
      </div>

      {currentStaff?.role !== "staff" ? (
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-lg font-bold text-slate-900">表示対象の切替</div>
              <div className="mt-1 text-sm text-slate-500">
                全体表示または担当者ごとの数値に切り替えできます。
              </div>
            </div>
            <div className="text-sm text-slate-500">
              対象: グラフ / 合計 / 前月比 / スタッフ実績 / 支払い集計
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                表示対象
              </label>
              <select
                value={selectedStaffFilter}
                onChange={(e) => setSelectedStaffFilter(e.target.value)}
                className="w-full rounded-xl border bg-white px-3 py-2"
              >
                <option value="all">全体</option>
                {staffOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-500">現在表示中</span>
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">
                    {selectedStaffFilter === "all" ? "全体" : selectedStaffFilter}
                  </span>
                </div>

                {selectedStaffFilter !== "all" ? (
                  <button
                    type="button"
                    onClick={() => setSelectedStaffFilter("all")}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  >
                    全体に戻す
                  </button>
                ) : null}
              </div>

              <div className="mt-3">
                {selectedStaffFilter === "all" ? (
                  <span>
                    現在は店舗全体の数値を表示しています。担当者を選ぶと、その担当者ベースの売上推移に切り替わります。
                  </span>
                ) : (
                  <span>
                    現在は <span className="font-bold text-slate-900">{selectedStaffFilter}</span>{" "}
                    の数値を表示しています。経費は店舗共通のため、そのまま合算表示です。
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-lg font-bold text-slate-900">
                今月の経営レポートを確認
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-500">
                月を選んでレポート生成後、そのままPDFで確認・保存・共有できます。
              </div>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsDemo(true)}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow hover:bg-blue-500"
              >
                デモ表示
              </button>

              <button
                type="button"
                onClick={() => setIsDemo(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow hover:bg-slate-50"
              >
                実データ
              </button>

              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={!canExport || isGeneratingReport}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow hover:bg-slate-50 disabled:opacity-50"
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
                  className="rounded-xl bg-slate-300 px-4 py-3 text-sm font-bold text-white shadow disabled:cursor-not-allowed"
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
              className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
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
              className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
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
              className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
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

          <div className="mt-4">
            <button
              type="button"
              onClick={handleExportMonthlyCsv}
              disabled={!selectedMonth}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow hover:bg-slate-50 disabled:opacity-50"
            >
              月次総合CSVを出力
            </button>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            売上明細CSVは「来店一覧」、経費明細CSVは「経費一覧」から出力します。
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="text-sm text-slate-500">売上 合計 ({targetLabel})</div>
          <div className="mt-2 text-[2rem] font-bold leading-none text-slate-900 md:text-5xl">
            {yen(total.sales)}
          </div>
          <div className="mt-3 text-sm text-slate-500">
            {targetLabel}の売上の流れをまとめて把握
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="text-sm text-slate-500">経費 合計 ({targetLabel})</div>
          <div className="mt-2 text-[2rem] font-bold leading-none text-slate-900 md:text-5xl">
            {yen(total.expenses)}
          </div>
          <div className="mt-3 text-sm text-slate-500">
            {targetLabel}表示時のコスト状況を確認
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="text-sm text-slate-500">粗利 合計 ({targetLabel})</div>
          <div className="mt-2 text-[2rem] font-bold leading-none text-slate-900 md:text-5xl">
            {yen(total.profit)}
          </div>
          <div className="mt-3 text-sm text-slate-500">
            {targetLabel}表示時の利益を把握
          </div>
        </div>
      </div>

      {!isDemo ? (
        <>
          <div className="rounded-3xl border bg-white p-5 shadow">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900">
                  今月の支払い集計
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  今月の決済内訳から、支払い手段別の比率を確認できます。
                </div>
              </div>
              <div className="text-sm text-slate-500">
                内訳件数: {paymentCount.toLocaleString()}件
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="text-sm text-slate-500">現金</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {yen(cashSales)}
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="text-sm text-slate-500">キャッシュレス合計</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {yen(cashlessSales)}
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="text-sm text-slate-500">ホットペッパーポイント</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {yen(pointSales)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-5 shadow">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900">
                  支払い手段別ランキング
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  今月の利用額が多い順です。
                </div>
              </div>
              <div className="text-sm text-slate-500">表示順: 利用額が高い順</div>
            </div>

            {paymentMethodRows.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                今月の支払い内訳データはありません。
              </div>
            ) : (
              <div className="space-y-4">
                {paymentMethodRows.map((row, index) => (
                  <div
                    key={`${row.method}-${index}`}
                    className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold shadow ${getRankBadgeClass(
                            index
                          )}`}
                        >
                          #{index + 1}
                        </div>

                        <div>
                          <div className="text-lg font-bold text-slate-900">
                            {row.method}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            今月の利用額
                          </div>
                        </div>
                      </div>

                      <div className="text-left md:text-right">
                        <div className="text-sm text-slate-500">利用額</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                          {yen(row.amount)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
                        <div className="text-xs font-medium text-slate-500">順位</div>
                        <div className="mt-2 text-xl font-bold text-slate-900">
                          {index + 1}位
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
                        <div className="text-xs font-medium text-slate-500">構成比</div>
                        <div className="mt-2 text-xl font-bold text-slate-900">
                          {totalPriceSafe(paymentMethodRows) > 0
                            ? `${((row.amount / totalPriceSafe(paymentMethodRows)) * 100).toFixed(
                                1
                              )}%`
                            : "0.0%"}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
                        <div className="text-xs font-medium text-slate-500">分類</div>
                        <div className="mt-2 text-xl font-bold text-slate-900">
                          {row.method === "現金"
                            ? "現金"
                            : row.method === "ホットペッパーポイント"
                            ? "ポイント"
                            : "キャッシュレス"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}

      <div className={`rounded-3xl border p-5 shadow ${alertBoxClass}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-slate-900">
              今月、優先して確認したいポイント
            </div>
            <div className="mt-1 text-sm leading-6 text-slate-600">
              {targetLabel}の前月比から見た、今月の改善ポイントです。
            </div>
          </div>
          <div
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${danger.badgeClass}`}
          >
            注意度 {danger.label}
          </div>
        </div>

        <div className="font-bold text-slate-900">{comment.title}</div>
        <div className="mt-2 text-sm leading-7 text-slate-700">{comment.body}</div>

        {cur && prev ? (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-sm text-slate-500">売上 前月比 ({targetLabel})</div>
              <div
                className={`mt-2 text-3xl font-bold ${getRateColor(salesRate, "sales")}`}
              >
                {arrow(salesRate)} {salesRate >= 0 ? "+" : ""}
                {salesRate.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {changeLabel(salesRate, "sales")}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-sm text-slate-500">経費 前月比 ({targetLabel})</div>
              <div
                className={`mt-2 text-3xl font-bold ${getRateColor(expRate, "expenses")}`}
              >
                {arrow(expRate)} {expRate >= 0 ? "+" : ""}
                {expRate.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {changeLabel(expRate, "expenses")}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-sm text-slate-500">粗利 前月比 ({targetLabel})</div>
              <div
                className={`mt-2 text-3xl font-bold ${getRateColor(profitRate, "profit")}`}
              >
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

      {!isDemo && currentStaff?.role !== "staff" && selectedStaffFilter === "all" ? (
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-lg font-bold text-slate-900">スタッフ別売上</div>
              <div className="mt-1 text-sm text-slate-500">
                今月の担当別売上と来店件数です。
              </div>
            </div>
            <div className="text-sm text-slate-500">表示順: 売上が高い順</div>
          </div>

          {staffSalesRows.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              今月のスタッフ別データはありません。
            </div>
          ) : (
            <div className="space-y-4">
              {staffSalesRows.map((row, index) => (
                <div
                  key={row.name}
                  className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold shadow ${getRankBadgeClass(
                          index
                        )}`}
                      >
                        #{index + 1}
                      </div>

                      <div>
                        <div className="text-lg font-bold text-slate-900">{row.name}</div>
                        <div className="mt-1 text-sm text-slate-500">今月の担当実績</div>
                      </div>
                    </div>

                    <div className="text-left md:text-right">
                      <div className="text-sm text-slate-500">担当売上</div>
                      <div className="mt-1 text-2xl font-bold text-slate-900">
                        {yen(row.sales)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
                      <div className="text-xs font-medium text-slate-500">来店件数</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">{row.count}件</div>
                    </div>

                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
                      <div className="text-xs font-medium text-slate-500">客単価</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">
                        {row.count > 0 ? yen(row.sales / row.count) : yen(0)}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
                      <div className="text-xs font-medium text-slate-500">順位</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">{index + 1}位</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!isDemo &&
      currentStaff?.role !== "staff" &&
      selectedStaffFilter !== "all" ? (
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-lg font-bold text-slate-900">
                選択中スタッフの今月実績
              </div>
              <div className="mt-1 text-sm text-slate-500">
                現在表示している担当者の今月数値です。
              </div>
            </div>
            <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">
              {selectedStaffFilter}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">担当者</div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {selectedStaffFilter}
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">来店件数</div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {currentFilteredVisitCount}件
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">担当売上</div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {yen(myMonthlySales)}
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">客単価</div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {yen(currentFilteredAvgUnitPrice)}
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">売上前月比</div>
              <div
                className={`mt-2 text-xl font-bold ${getRateColor(salesRate, "sales")}`}
              >
                {arrow(salesRate)} {salesRate >= 0 ? "+" : ""}
                {salesRate.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">粗利前月比</div>
              <div
                className={`mt-2 text-xl font-bold ${getRateColor(
                  profitRate,
                  "profit"
                )}`}
              >
                {arrow(profitRate)} {profitRate >= 0 ? "+" : ""}
                {profitRate.toFixed(1)}%
              </div>
            </div>
          </div>
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
                {yen(myMonthlySales)}
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">客単価</div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {yen(currentFilteredAvgUnitPrice)}
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">売上前月比</div>
              <div
                className={`mt-2 text-xl font-bold ${getRateColor(salesRate, "sales")}`}
              >
                {arrow(salesRate)} {salesRate >= 0 ? "+" : ""}
                {salesRate.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">粗利前月比</div>
              <div
                className={`mt-2 text-xl font-bold ${getRateColor(
                  profitRate,
                  "profit"
                )}`}
              >
                {arrow(profitRate)} {profitRate >= 0 ? "+" : ""}
                {profitRate.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border bg-white p-5 shadow">
        <div className="mb-4">
          <div className="text-lg font-bold text-slate-900">
            月次推移グラフ ({targetLabel})
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-500">
            {targetLabel}の売上・経費・粗利の流れを一目で確認できます。
          </div>
        </div>

        <div className="h-[280px] sm:h-[320px]">
          <ResponsiveContainer>
            <LineChart data={displayRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
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