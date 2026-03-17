"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type VisitRow = Record<string, unknown>;
type CustomerRow = Record<string, unknown>;

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

function getVisitMenu(row: VisitRow) {
  return pickFirstString(row, [
    "menu_name",
    "menu",
    "treatment_name",
    "service_name",
  ]);
}

function getVisitMemo(row: VisitRow) {
  return pickFirstString(row, [
    "memo",
    "note",
    "notes",
    "remark",
    "remarks",
  ]);
}

function getVisitCustomerId(row: VisitRow) {
  return pickFirstString(row, ["customer_id"]);
}

function getCustomerName(row: CustomerRow) {
  return (
    pickFirstString(row, ["name", "full_name", "customer_name"]) || "名称未設定"
  );
}

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatDateLabel(value: string) {
  if (!value) return "日時未設定";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mi = `${date.getMinutes()}`.padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
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

export default function SalesPaymentsPage() {
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [customersMap, setCustomersMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [monthValue, setMonthValue] = useState(toMonthValue(new Date()));

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setErrorText("");

      try {
        const [visitsRes, customersRes] = await Promise.all([
          supabase.from("visits").select("*"),
          supabase.from("customers").select("*"),
        ]);

        if (!isMounted) return;

        if (visitsRes.error) {
          throw new Error(`visits取得失敗: ${visitsRes.error.message}`);
        }

        if (customersRes.error) {
          throw new Error(`customers取得失敗: ${customersRes.error.message}`);
        }

        const visitsData = (visitsRes.data || []) as VisitRow[];
        const customersData = (customersRes.data || []) as CustomerRow[];

        const map: Record<string, string> = {};
        for (const row of customersData) {
          const id = row.id ? String(row.id) : "";
          if (id) {
            map[id] = getCustomerName(row);
          }
        }

        setVisits(visitsData);
        setCustomersMap(map);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "売上データの取得に失敗しました";
        console.error("sales-payments fetch error:", message);
        setErrorText(`データ取得でエラーが発生しました：${message}`);
        setVisits([]);
        setCustomersMap({});
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const sortedVisits = useMemo(() => {
    return [...visits].sort((a, b) => {
      const aTime = new Date(getVisitDate(a) || 0).getTime();
      const bTime = new Date(getVisitDate(b) || 0).getTime();
      return bTime - aTime;
    });
  }, [visits]);

  const monthlyVisits = useMemo(() => {
    return sortedVisits.filter((row) => isInMonth(getVisitDate(row), monthValue));
  }, [sortedVisits, monthValue]);

  const monthlySales = useMemo(() => {
    return monthlyVisits.reduce((sum, row) => sum + getVisitAmount(row), 0);
  }, [monthlyVisits]);

  const totalSales = useMemo(() => {
    return sortedVisits.reduce((sum, row) => sum + getVisitAmount(row), 0);
  }, [sortedVisits]);

  const averageUnitPrice = useMemo(() => {
    if (monthlyVisits.length === 0) return 0;
    return Math.round(monthlySales / monthlyVisits.length);
  }, [monthlySales, monthlyVisits]);

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
            Naily AiDOL / 売上管理
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
            売上一覧と月次集計を確認
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
            まずは visits ベースで安全に売上を集計します。入金テーブル未整備でも使える構成です。
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
            href="/reports/monthly"
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
            月次レポートへ
          </Link>

          <Link
            href="/dashboard"
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
            ダッシュボードへ
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
              borderRadius: 18,
              border: "1px solid #f3e8e2",
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
              当月売上
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#111827",
                marginBottom: 6,
              }}
            >
              {loading ? "..." : formatYen(monthlySales)}
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>{monthValue}</div>
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
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
              累計売上
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#111827",
                marginBottom: 6,
              }}
            >
              {loading ? "..." : formatYen(totalSales)}
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>全期間</div>
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
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
              来店件数
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#111827",
                marginBottom: 6,
              }}
            >
              {loading ? "..." : `${monthlyVisits.length}件`}
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>対象月</div>
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
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
              客単価
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#111827",
                marginBottom: 6,
              }}
            >
              {loading ? "..." : formatYen(averageUnitPrice)}
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>対象月平均</div>
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
            対象月の来店売上
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
            実在カラムだけをフォールバックで読むので、`visit_date` 固定参照のエラーを回避します。
          </p>

          {loading ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>読み込み中...</div>
          ) : monthlyVisits.length === 0 ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              この月の来店売上データはありません。
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {monthlyVisits.map((row, index) => {
                const customerId = getVisitCustomerId(row);
                const customerName = customersMap[customerId] || "顧客不明";
                const visitDate = getVisitDate(row);
                const menu = getVisitMenu(row) || "未入力";
                const memo = getVisitMemo(row);
                const amount = getVisitAmount(row);

                return (
                  <div
                    key={`${customerId}-${visitDate}-${index}`}
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
                      {customerName}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#6b7280",
                        marginBottom: 10,
                      }}
                    >
                      {formatDateLabel(visitDate)}
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 14, color: "#9a3412", fontWeight: 700 }}>
                        メニュー
                      </div>
                      <div style={{ fontSize: 16, color: "#111827", fontWeight: 700 }}>
                        {menu}
                      </div>

                      <div
                        style={{
                          fontSize: 14,
                          color: "#9a3412",
                          fontWeight: 700,
                          marginTop: 6,
                        }}
                      >
                        金額
                      </div>
                      <div style={{ fontSize: 16, color: "#111827", fontWeight: 700 }}>
                        {formatYen(amount)}
                      </div>

                      {memo ? (
                        <>
                          <div
                            style={{
                              fontSize: 14,
                              color: "#9a3412",
                              fontWeight: 700,
                              marginTop: 6,
                            }}
                          >
                            メモ
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: "#374151",
                              lineHeight: 1.7,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {memo}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}