"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

function getExpenseDate(row: ExpenseRow) {
  return pickFirstString(row, [
    "expense_date",
    "date",
    "paid_at",
    "created_at",
  ]);
}

function getExpenseTitle(row: ExpenseRow) {
  return (
    pickFirstString(row, [
      "title",
      "name",
      "expense_name",
      "item_name",
      "category",
    ]) || "未入力"
  );
}

function getExpenseMemo(row: ExpenseRow) {
  return pickFirstString(row, [
    "memo",
    "note",
    "notes",
    "remark",
    "remarks",
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

function formatDateLabel(value: string) {
  if (!value) return "日時未設定";

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, "0");
    const dd = `${date.getDate()}`.padStart(2, "0");
    return `${yyyy}/${mm}/${dd}`;
  }

  return value;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setErrorText("");
      setTableMissing(false);

      try {
        const { data, error } = await supabase.from("expenses").select("*");

        if (!isMounted) return;

        const missing =
          error &&
          error.message.includes("Could not find the table 'public.expenses'");

        if (missing) {
          setTableMissing(true);
          setExpenses([]);
          return;
        }

        if (error) {
          throw new Error(error.message);
        }

        setExpenses((data || []) as ExpenseRow[]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "経費データの取得に失敗しました";
        setErrorText(`データ取得でエラーが発生しました：${message}`);
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

  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const aTime = new Date(getExpenseDate(a) || 0).getTime();
      const bTime = new Date(getExpenseDate(b) || 0).getTime();
      return bTime - aTime;
    });
  }, [expenses]);

  const totalExpenses = useMemo(() => {
    return sortedExpenses.reduce((sum, row) => sum + getExpenseAmount(row), 0);
  }, [sortedExpenses]);

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
            Naily AiDOL / 経費管理
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
            経費一覧
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
            経費テーブルが未作成でも画面が落ちないようにしています。
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

        {tableMissing ? (
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
            expenses テーブルがまだ無いため、経費機能は未設定です。
            いまは売上管理を優先し、経費は後から追加できます。
          </div>
        ) : null}

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
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
            累計経費
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#111827",
            }}
          >
            {loading ? "..." : formatYen(totalExpenses)}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            border: "1px solid #f3e8e2",
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            padding: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: "#111827",
            }}
          >
            経費明細
          </h2>

          <p
            style={{
              marginTop: 8,
              marginBottom: 16,
              fontSize: 14,
              color: "#6b7280",
              lineHeight: 1.7,
            }}
          >
            登録済みの経費を表示します。
          </p>

          {loading ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>読み込み中...</div>
          ) : sortedExpenses.length === 0 ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              経費データはまだありません。
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {sortedExpenses.map((row, index) => (
                <div
                  key={`${getExpenseDate(row)}-${index}`}
                  style={{
                    background: "#fff7f3",
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 800,
                      color: "#111827",
                      marginBottom: 6,
                    }}
                  >
                    {getExpenseTitle(row)}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#6b7280",
                      marginBottom: 10,
                    }}
                  >
                    {formatDateLabel(getExpenseDate(row))}
                  </div>

                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#111827",
                      marginBottom: 8,
                    }}
                  >
                    {formatYen(getExpenseAmount(row))}
                  </div>

                  {getExpenseMemo(row) ? (
                    <div
                      style={{
                        fontSize: 14,
                        color: "#374151",
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {getExpenseMemo(row)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}