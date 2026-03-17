"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Visit = {
  id: string;
  customer_id?: string | null;
  salon_id?: string | null;
  visit_date?: string | null;
  date?: string | null;
  visited_at?: string | null;
  reservation_date?: string | null;
  menu_name?: string | null;
  menu?: string | null;
  treatment_name?: string | null;
  service_name?: string | null;
  amount?: number | string | null;
  price?: number | string | null;
  sales_amount?: number | string | null;
  total_amount?: number | string | null;
  memo?: string | null;
  note?: string | null;
  notes?: string | null;
  remark?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Customer = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  customer_name?: string | null;
  phone?: string | null;
};

function getCustomerName(customer?: Customer | null) {
  if (!customer) return "顧客不明";
  return (
    customer.name ||
    customer.full_name ||
    customer.customer_name ||
    "名称未設定"
  );
}

function getVisitDate(visit: Visit) {
  return (
    visit.visit_date ||
    visit.date ||
    visit.visited_at ||
    visit.reservation_date ||
    ""
  );
}

function formatVisitDate(value: string) {
  if (!value) return "日時未設定";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mi = `${d.getMinutes()}`.padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

function getMenuName(visit: Visit) {
  return (
    visit.menu_name ||
    visit.menu ||
    visit.treatment_name ||
    visit.service_name ||
    "未入力"
  );
}

function getAmountValue(visit: Visit) {
  const raw =
    visit.amount ??
    visit.price ??
    visit.sales_amount ??
    visit.total_amount ??
    null;

  if (raw === null || raw === undefined || raw === "") return "未入力";

  const num = Number(raw);
  if (Number.isNaN(num)) return String(raw);

  return `¥${num.toLocaleString("ja-JP")}`;
}

function getMemoText(visit: Visit) {
  return (
    visit.memo ||
    visit.note ||
    visit.notes ||
    visit.remark ||
    visit.remarks ||
    ""
  );
}

export default function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [customersMap, setCustomersMap] = useState<Record<string, Customer>>({});
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setErrorText("");

    try {
      const [visitsRes, customersRes] = await Promise.all([
        supabase.from("visits").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("*"),
      ]);

      if (visitsRes.error) {
        throw new Error(`visits 読み込み失敗: ${visitsRes.error.message}`);
      }

      if (customersRes.error) {
        throw new Error(`customers 読み込み失敗: ${customersRes.error.message}`);
      }

      const visitsData = (visitsRes.data || []) as Visit[];
      const customersData = (customersRes.data || []) as Customer[];

      const map: Record<string, Customer> = {};
      for (const customer of customersData) {
        map[String(customer.id)] = customer;
      }

      setVisits(visitsData);
      setCustomersMap(map);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "来店一覧の読み込みに失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const sortedVisits = useMemo(() => {
    return [...visits].sort((a, b) => {
      const aTime = new Date(getVisitDate(a) || a.created_at || 0).getTime();
      const bTime = new Date(getVisitDate(b) || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [visits]);

  async function handleDelete(visitId: string) {
    const ok = window.confirm("この来店履歴を削除しますか？");
    if (!ok) return;

    setDeletingId(visitId);
    setErrorText("");

    try {
      const { error } = await supabase.from("visits").delete().eq("id", visitId);

      if (error) {
        throw new Error(error.message);
      }

      setVisits((prev) => prev.filter((visit) => String(visit.id) !== String(visitId)));
    } catch (error) {
      setErrorText(
        error instanceof Error ? `削除エラー: ${error.message}` : "削除に失敗しました"
      );
    } finally {
      setDeletingId(null);
    }
  }

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                color: "#111827",
              }}
            >
              来店一覧
            </h1>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 14,
                color: "#6b7280",
              }}
            >
              登録済みの来店履歴を確認できます
            </p>
          </div>

          <Link
            href="/visits/new"
            style={{
              textDecoration: "none",
              background: "#fb923c",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
              padding: "12px 16px",
              borderRadius: 12,
              whiteSpace: "nowrap",
            }}
          >
            ＋ 来店登録
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

        {loading ? (
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              padding: 20,
              border: "1px solid #f3e8e2",
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
              color: "#6b7280",
              fontSize: 14,
            }}
          >
            読み込み中...
          </div>
        ) : sortedVisits.length === 0 ? (
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              padding: 20,
              border: "1px solid #f3e8e2",
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#6b7280",
                lineHeight: 1.7,
              }}
            >
              まだ来店履歴がありません。
            </p>

            <Link
              href="/visits/new"
              style={{
                display: "inline-block",
                marginTop: 12,
                textDecoration: "none",
                background: "#fb923c",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                padding: "12px 16px",
                borderRadius: 12,
              }}
            >
              来店を登録する
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {sortedVisits.map((visit) => {
              const customer = customersMap[String(visit.customer_id || "")];
              const visitDate = getVisitDate(visit);
              const menu = getMenuName(visit);
              const amount = getAmountValue(visit);
              const memo = getMemoText(visit);
              const isDeleting = deletingId === String(visit.id);

              return (
                <div
                  key={visit.id}
                  style={{
                    background: "#fff",
                    borderRadius: 18,
                    padding: 16,
                    border: "1px solid #f3e8e2",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#111827",
                          lineHeight: 1.5,
                          wordBreak: "break-word",
                        }}
                      >
                        {getCustomerName(customer)}
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: "#6b7280",
                          lineHeight: 1.6,
                        }}
                      >
                        {formatVisitDate(visitDate)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(String(visit.id))}
                      disabled={isDeleting}
                      style={{
                        border: "1px solid #fecaca",
                        background: isDeleting ? "#f3f4f6" : "#fff1f2",
                        color: isDeleting ? "#9ca3af" : "#dc2626",
                        borderRadius: 12,
                        padding: "10px 12px",
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: isDeleting ? "not-allowed" : "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {isDeleting ? "削除中..." : "削除"}
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        background: "#fff7f3",
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#9a3412",
                          marginBottom: 4,
                        }}
                      >
                        メニュー
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "#111827",
                          lineHeight: 1.6,
                          wordBreak: "break-word",
                        }}
                      >
                        {menu}
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#fff7f3",
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#9a3412",
                          marginBottom: 4,
                        }}
                      >
                        金額
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "#111827",
                          lineHeight: 1.6,
                        }}
                      >
                        {amount}
                      </div>
                    </div>

                    {memo ? (
                      <div
                        style={{
                          background: "#fff7f3",
                          borderRadius: 12,
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#9a3412",
                            marginBottom: 4,
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
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}