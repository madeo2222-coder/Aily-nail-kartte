"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type VisitRow = Record<string, unknown>;
type ExpenseRow = Record<string, unknown>;

function pickFirstString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== "") {
      return String(value);
    }
  }
  return "";
}

function pickFirstNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== "") {
      const num = Number(value);
      if (!Number.isNaN(num)) return num;
    }
  }
  return 0;
}

function getVisitDate(row: VisitRow) {
  return pickFirstString(row, [
    "visit_date",
    "date",
    "visited_at",
    "reservation_date",
    "created_at",
  ]);
}

function getVisitAmount(row: VisitRow) {
  return pickFirstNumber(row, [
    "amount",
    "price",
    "sales_amount",
    "total_amount",
  ]);
}

function getExpenseDate(row: ExpenseRow) {
  return pickFirstString(row, [
    "expense_date",
    "date",
    "paid_at",
    "created_at",
  ]);
}

function getExpenseAmount(row: ExpenseRow) {
  return pickFirstNumber(row, [
    "amount",
    "price",
    "expense_amount",
    "total_amount",
  ]);
}

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function toMonthValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function isInMonth(dateText: string, monthValue: string) {
  if (!dateText) return false;

  const date = new Date(dateText);
  if (!Number.isNaN(date.getTime())) {
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, "0");
    return `${yyyy}-${mm}` === monthValue;
  }

  return dateText.slice(0, 7) === monthValue;
}

export default function MonthlyClosingPage() {
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [monthValue, setMonthValue] = useState(toMonthValue(new Date()));
  const [expensesTableMissing, setExpensesTableMissing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setErrorText("");
      setExpensesTableMissing(false);

      try {
        const [visitsRes, expensesRes] = await Promise.all([
          supabase.from("visits").select("*"),
          supabase.from("expenses").select("*"),
        ]);

        if (!isMounted) return;

        if (visitsRes.error) {
          throw new Error(`visits取得失敗: ${visitsRes.error.message}`);
        }

        const missingExpensesTable =
          expensesRes.error &&
          expensesRes.error.message.includes("Could not find the table 'public.expenses'");

        if (expensesRes.error && !missingExpensesTable) {
          throw new Error(`expenses取得失敗: ${expensesRes.error.message}`);
        }

        setVisits((visitsRes.data || []) as VisitRow[]);
        setExpenses(missingExpensesTable ? [] : ((expensesRes.data || []) as ExpenseRow[]));
        setExpensesTableMissing(Boolean(missingExpensesTable));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "月次締めデータ取得に失敗しました";
        setErrorText(`データ取得でエラーが発生しました：${message}`);
        setVisits([]);
        setExpenses([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const monthlyVisits = useMemo(() => {
    return visits.filter((row) => isInMonth(getVisitDate(row), monthValue));
  }, [visits, monthValue]);

  const monthlyExpenses = useMemo(() => {
    return expenses.filter((row) => isInMonth(getExpenseDate(row), monthValue));
  }, [expenses, monthValue]);

  const totalSales = useMemo(() => {
    return monthlyVisits.reduce((sum, row) => sum + getVisitAmount(row), 0);
  }, [monthlyVisits]);

  const totalExpenses = useMemo(() => {
    return monthlyExpenses.reduce((sum, row) => sum + getExpenseAmount(row), 0);
  }, [monthlyExpenses]);

  const totalProfit = totalSales - totalExpenses;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fff7f3",
        padding: "16px 16px 112px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 14,
              color: "#6b7280",
              marginBottom: 8,
            }}
          >
            Naily AiDOL / 月次締め
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 24,
              lineHeight: 1.4,
              fontWeight: 800,
              color: "#111827",
            }}
          >
            月次締め
          </h1>

          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              color: "#6b7280",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            売上と経費から月次収支を自動集計します
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <Link
            href="/dashboard"
            style={{
              textDecoration: "none",
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111827",
              padding: "12px 16px",
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            ダッシュボードへ
          </Link>

          <Link
            href="/sales-payments"
            style={{
              textDecoration: "none",
              background: "#111827",
              color: "#fff",
              padding: "12px 16px",
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            売上管理へ
          </Link>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            border: "1px solid #f3e8e2",
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            padding: 16,
            marginBottom: 16,
          }}
        >
          <label
            htmlFor="month"
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 8,
            }}
          >
            対象月
          </label>

          <input
            id="month"
            type="month"
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value)}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 12,
              border: "1px solid #d1d5db",
              padding: "0 12px",
              fontSize: 16,
              background: "#fff",
              color: "#111827",
              boxSizing: "border-box",
            }}
          />
        </div>

        {errorText ? (
          <div
            style={{
              marginBottom: 16,
              background: "#fff1f2",
              color: "#be123c",
              border: "1px solid #fecdd3",
              borderRadius: 14,
              padding: 12,
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {errorText}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "2px solid #111827",
              padding: 20,
              boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 10 }}>
              総売上
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#111827" }}>
              {loading ? "..." : formatYen(totalSales)}
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "2px solid #111827",
              padding: 20,
              boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 10 }}>
              総経費
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#111827" }}>
              {loading ? "..." : formatYen(totalExpenses)}
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "2px solid #111827",
              padding: 20,
              boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 10 }}>
              総利益
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#111827" }}>
              {loading ? "..." : formatYen(totalProfit)}
            </div>
          </div>
        </div>

        {expensesTableMissing ? (
          <div
            style={{
              marginBottom: 16,
              background: "#fffbeb",
              color: "#92400e",
              border: "1px solid #fde68a",
              borderRadius: 14,
              padding: 12,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            expenses テーブルがまだ無いため、経費は ¥0 として集計しています。
          </div>
        ) : null}

        {!loading && monthlyVisits.length === 0 && monthlyExpenses.length === 0 ? (
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              border: "1px solid #d1d5db",
              padding: 20,
              textAlign: "center",
              color: "#6b7280",
              fontSize: 16,
            }}
          >
            集計できるデータがまだありません
          </div>
        ) : null}
      </div>
    </main>
  );
}