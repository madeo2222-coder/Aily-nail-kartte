"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  customer_name?: string | null;
  kana?: string | null;
  phone?: string | null;
  salon_id?: string | null;
};

type VisitRow = Record<string, unknown>;

type FormState = {
  customerId: string;
  visitDate: string;
  menu: string;
  amount: string;
  memo: string;
};

const DATE_ALIASES = ["visit_date", "date", "visited_at", "reservation_date"];
const MENU_ALIASES = ["menu_name", "menu", "treatment_name", "service_name"];
const AMOUNT_ALIASES = ["amount", "price", "sales_amount", "total_amount"];
const MEMO_ALIASES = ["memo", "note", "notes", "remark", "remarks"];
const CUSTOMER_ID_ALIASES = ["customer_id"];
const SALON_ID_ALIASES = ["salon_id"];
const CREATED_AT_ALIASES = ["created_at"];
const UPDATED_AT_ALIASES = ["updated_at"];

function getCustomerLabel(customer: Customer) {
  return (
    customer.name ||
    customer.full_name ||
    customer.customer_name ||
    "名称未設定"
  );
}

function toDatetimeLocalString(date: Date) {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mi = `${date.getMinutes()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function pickExistingKey(keys: string[], aliases: string[]) {
  return aliases.find((alias) => keys.includes(alias)) || null;
}

function buildStrictPayloadFromExistingRow(params: {
  existingKeys: string[];
  form: FormState;
  selectedCustomer: Customer | null;
}) {
  const { existingKeys, form, selectedCustomer } = params;

  const payload: Record<string, unknown> = {};

  const customerIdKey = pickExistingKey(existingKeys, CUSTOMER_ID_ALIASES);
  if (customerIdKey) payload[customerIdKey] = form.customerId;

  const dateKey = pickExistingKey(existingKeys, DATE_ALIASES);
  if (dateKey) payload[dateKey] = form.visitDate;

  const menuKey = pickExistingKey(existingKeys, MENU_ALIASES);
  if (menuKey) payload[menuKey] = form.menu;

  const amountKey = pickExistingKey(existingKeys, AMOUNT_ALIASES);
  if (amountKey) {
    const num = form.amount === "" ? 0 : Number(form.amount);
    payload[amountKey] = Number.isNaN(num) ? 0 : num;
  }

  const memoKey = pickExistingKey(existingKeys, MEMO_ALIASES);
  if (memoKey) payload[memoKey] = form.memo;

  const salonIdKey = pickExistingKey(existingKeys, SALON_ID_ALIASES);
  if (salonIdKey && selectedCustomer?.salon_id) {
    payload[salonIdKey] = selectedCustomer.salon_id;
  }

  const createdAtKey = pickExistingKey(existingKeys, CREATED_AT_ALIASES);
  if (createdAtKey && !payload[createdAtKey]) {
    payload[createdAtKey] = new Date().toISOString();
  }

  const updatedAtKey = pickExistingKey(existingKeys, UPDATED_AT_ALIASES);
  if (updatedAtKey && !payload[updatedAtKey]) {
    payload[updatedAtKey] = new Date().toISOString();
  }

  return payload;
}

function buildFallbackPayloadCandidates(params: {
  form: FormState;
  selectedCustomer: Customer | null;
}) {
  const { form, selectedCustomer } = params;
  const amount = form.amount === "" ? 0 : Number(form.amount);
  const safeAmount = Number.isNaN(amount) ? 0 : amount;

  const baseList: Record<string, unknown>[] = [
    {
      customer_id: form.customerId,
      visit_date: form.visitDate,
      menu_name: form.menu,
      amount: safeAmount,
      memo: form.memo,
      ...(selectedCustomer?.salon_id ? { salon_id: selectedCustomer.salon_id } : {}),
    },
    {
      customer_id: form.customerId,
      date: form.visitDate,
      menu_name: form.menu,
      amount: safeAmount,
      memo: form.memo,
      ...(selectedCustomer?.salon_id ? { salon_id: selectedCustomer.salon_id } : {}),
    },
    {
      customer_id: form.customerId,
      visit_date: form.visitDate,
      menu: form.menu,
      price: safeAmount,
      memo: form.memo,
      ...(selectedCustomer?.salon_id ? { salon_id: selectedCustomer.salon_id } : {}),
    },
    {
      customer_id: form.customerId,
      date: form.visitDate,
      menu: form.menu,
      price: safeAmount,
      note: form.memo,
      ...(selectedCustomer?.salon_id ? { salon_id: selectedCustomer.salon_id } : {}),
    },
    {
      customer_id: form.customerId,
      visited_at: form.visitDate,
      treatment_name: form.menu,
      sales_amount: safeAmount,
      notes: form.memo,
      ...(selectedCustomer?.salon_id ? { salon_id: selectedCustomer.salon_id } : {}),
    },
  ];

  return baseList;
}

export default function NewVisitPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visitsSampleKeys, setVisitsSampleKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [form, setForm] = useState<FormState>({
    customerId: "",
    visitDate: toDatetimeLocalString(new Date()),
    menu: "",
    amount: "",
    memo: "",
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setPageError("");

      try {
        const [customersRes, visitsRes] = await Promise.all([
          supabase.from("customers").select("*").order("created_at", { ascending: false }),
          supabase.from("visits").select("*").limit(1),
        ]);

        if (!isMounted) return;

        if (customersRes.error) {
          throw new Error(`customers 読み込み失敗: ${customersRes.error.message}`);
        }

        const customersData = (customersRes.data || []) as Customer[];
        setCustomers(customersData);

        if (customersData.length > 0) {
          setForm((prev) => ({
            ...prev,
            customerId: prev.customerId || String(customersData[0].id),
          }));
        }

        if (!visitsRes.error && visitsRes.data && visitsRes.data.length > 0) {
          const sample = visitsRes.data[0] as VisitRow;
          setVisitsSampleKeys(Object.keys(sample));
        } else {
          setVisitsSampleKeys([]);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "初期データの読み込みに失敗しました";
        setPageError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => String(customer.id) === form.customerId) || null;
  }, [customers, form.customerId]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");

    if (!form.customerId) {
      setSubmitting(false);
      setSubmitError("顧客を選択してください。");
      return;
    }

    if (!form.visitDate) {
      setSubmitting(false);
      setSubmitError("来店日時を入力してください。");
      return;
    }

    if (!form.menu.trim()) {
      setSubmitting(false);
      setSubmitError("メニュー名を入力してください。");
      return;
    }

    if (form.amount !== "" && Number.isNaN(Number(form.amount))) {
      setSubmitting(false);
      setSubmitError("金額は数字で入力してください。");
      return;
    }

    try {
      if (visitsSampleKeys.length > 0) {
        const strictPayload = buildStrictPayloadFromExistingRow({
          existingKeys: visitsSampleKeys,
          form,
          selectedCustomer,
        });

        const { error } = await supabase.from("visits").insert([strictPayload]);

        if (!error) {
          router.push("/visits");
          router.refresh();
          return;
        }

        throw new Error(error.message);
      }

      const candidates = buildFallbackPayloadCandidates({
        form,
        selectedCustomer,
      });

      let lastErrorMessage = "来店登録に失敗しました。";

      for (const payload of candidates) {
        const { error } = await supabase.from("visits").insert([payload]);
        if (!error) {
          router.push("/visits");
          router.refresh();
          return;
        }
        lastErrorMessage = error.message;
      }

      throw new Error(lastErrorMessage);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "来店登録に失敗しました。";
      setSubmitError(`保存エラー: ${message}`);
    } finally {
      setSubmitting(false);
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
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Link
            href="/visits"
            style={{
              textDecoration: "none",
              color: "#111827",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            ← 来店一覧へ戻る
          </Link>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 20,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            border: "1px solid #f3e8e2",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              lineHeight: 1.4,
              fontWeight: 800,
              color: "#111827",
            }}
          >
            来店登録
          </h1>

          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              fontSize: 14,
              color: "#6b7280",
              lineHeight: 1.7,
            }}
          >
            顧客を選んで、来店内容を登録します。
          </p>

          {pageError ? (
            <div
              style={{
                marginTop: 16,
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
              {pageError}
            </div>
          ) : null}

          {loading ? (
            <div
              style={{
                marginTop: 20,
                fontSize: 14,
                color: "#6b7280",
              }}
            >
              読み込み中...
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <label
                    htmlFor="customerId"
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    顧客
                  </label>
                  <select
                    id="customerId"
                    value={form.customerId}
                    onChange={(e) => updateForm("customerId", e.target.value)}
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 12,
                      border: "1px solid #d1d5db",
                      padding: "0 12px",
                      fontSize: 16,
                      background: "#fff",
                      color: "#111827",
                    }}
                  >
                    {customers.length === 0 ? (
                      <option value="">顧客がいません</option>
                    ) : (
                      customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {getCustomerLabel(customer)}
                          {customer.phone ? ` / ${customer.phone}` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="visitDate"
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    来店日時
                  </label>
                  <input
                    id="visitDate"
                    type="datetime-local"
                    value={form.visitDate}
                    onChange={(e) => updateForm("visitDate", e.target.value)}
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

                <div>
                  <label
                    htmlFor="menu"
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    メニュー
                  </label>
                  <input
                    id="menu"
                    type="text"
                    placeholder="例：ワンカラー / 定額デザイン"
                    value={form.menu}
                    onChange={(e) => updateForm("menu", e.target.value)}
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

                <div>
                  <label
                    htmlFor="amount"
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    金額
                  </label>
                  <input
                    id="amount"
                    type="number"
                    inputMode="numeric"
                    placeholder="例：6500"
                    value={form.amount}
                    onChange={(e) => updateForm("amount", e.target.value)}
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

                <div>
                  <label
                    htmlFor="memo"
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    メモ
                  </label>
                  <textarea
                    id="memo"
                    placeholder="施術メモ、次回提案、注意点など"
                    value={form.memo}
                    onChange={(e) => updateForm("memo", e.target.value)}
                    rows={5}
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid #d1d5db",
                      padding: 12,
                      fontSize: 16,
                      background: "#fff",
                      color: "#111827",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {submitError ? (
                <div
                  style={{
                    marginTop: 16,
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
                  {submitError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting || customers.length === 0}
                style={{
                  width: "100%",
                  height: 52,
                  marginTop: 20,
                  border: "none",
                  borderRadius: 14,
                  background: submitting || customers.length === 0 ? "#cbd5e1" : "#fb923c",
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: submitting || customers.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "登録中..." : "来店登録する"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}