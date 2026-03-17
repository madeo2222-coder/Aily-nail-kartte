"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type VisitRow = Record<string, unknown>;
type CustomerRow = Record<string, unknown>;
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

export default function DashboardPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const currentMonth = useMemo(() => toMonthValue(new Date()), []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setErrorText("");

      try {
        const [customersRes, visitsRes, expensesRes] = await Promise.all([
          supabase.from("customers").select("*"),
          supabase.from("visits").select("*"),
          supabase.from("expenses").select("*"),
        ]);

        if (!isMounted) return;

        if (customersRes.error) {
          throw new Error(`customers取得失敗: ${customersRes.error.message}`);
        }

        if (visitsRes.error) {
          throw new Error(`visits取得失敗: ${visitsRes.error.message}`);
        }

        const expensesTableMissing =
          expensesRes.error &&
          expensesRes.error.message.includes("Could not find the table 'public.expenses'");

        if (expensesRes.error && !expensesTableMissing) {
          throw new Error(`expenses取得失敗: ${expensesRes.error.message}`);
        }

        setCustomers((customersRes.data || []) as CustomerRow[]);
        setVisits((visitsRes.data || []) as VisitRow[]);
        setExpenses(expensesTableMissing ? [] : ((expensesRes.data || []) as ExpenseRow[]));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "ダッシュボード取得に失敗しました";
        setErrorText(`データ取得でエラーが発生しました：${message}`);
        setCustomers([]);
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

  const totalCustomers = customers.length;
  const totalVisits = visits.length;

  const totalSales = useMemo(() => {
    return visits.reduce((sum, row) => sum + getVisitAmount(row), 0);
  }, [visits]);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, row) => sum + getExpenseAmount(row), 0);
  }, [expenses]);

  const totalProfit = totalSales - totalExpenses;

  const monthlyVisits = useMemo(() => {
    return visits.filter((row) => isInMonth(getVisitDate(row), currentMonth));
  }, [visits, currentMonth]);

  const monthlySales = useMemo(() => {
    return monthlyVisits.reduce((sum, row) => sum + getVisitAmount(row), 0);
  }, [monthlyVisits]);

  const monthlyExpenses = useMemo(() => {
    return expenses
      .filter((row) => isInMonth(getExpenseDate(row), currentMonth))
      .reduce((sum, row) => sum + getExpenseAmount(row), 0);
  }, [expenses, currentMonth]);

  const monthlyProfit = monthlySales - monthlyExpenses;

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
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              lineHeight: 1.4,
              fontWeight: 800,
              color: "#111827",
            }}
          >
            ダッシュボード
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
            サロンの主要数字をまとめて確認できます
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
            href="/sales-payments"
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
            売上管理へ
          </Link>

          <Link
            href="/reports/monthly"
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
            月次レポートへ
          </Link>
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "2px solid #111827",
              padding: 20,
              boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>
              総顧客数
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>
              {loading ? "..." : `${totalCustomers}人`}
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
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>
              総来店数
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>
              {loading ? "..." : `${totalVisits}件`}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            border: "2px solid #111827",
            padding: 20,
            boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>
            総売上
          </div>

          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "#111827",
              marginBottom: 20,
            }}
          >
            {loading ? "..." : formatYen(totalSales)}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
                総経費
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>
                {loading ? "..." : formatYen(totalExpenses)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
                総利益
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>
                {loading ? "..." : formatYen(totalProfit)}
              </div>
            </div>
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 18,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                lineHeight: 1.4,
                fontWeight: 800,
                color: "#111827",
              }}
            >
              今月の数字
            </h2>

            <div
              style={{
                background: "#f3f4f6",
                color: "#374151",
                borderRadius: 9999,
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {currentMonth}
            </div>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
                今月売上
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>
                {loading ? "..." : formatYen(monthlySales)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
                今月経費
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>
                {loading ? "..." : formatYen(monthlyExpenses)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
                今月利益
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>
                {loading ? "..." : formatYen(monthlyProfit)}
              </div>
            </div>
          </div>

          {expenses.length === 0 ? (
            <div
              style={{
                marginTop: 18,
                fontSize: 13,
                color: "#9ca3af",
                lineHeight: 1.6,
              }}
            >
              ※ expenses テーブル未作成または経費データ未登録のため、経費は ¥0 表示です。
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}