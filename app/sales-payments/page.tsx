"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
};

type Visit = {
  id: string;
  customer_id: string | null;
  visit_date?: string | null;
  menu_name?: string | null;
  staff_name?: string | null;
  memo?: string | null;
};

export default function SalesPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visit, setVisit] = useState<Visit | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [visitId, setVisitId] = useState("");
  const [saleDate, setSaleDate] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [menuName, setMenuName] = useState("");
  const [staffName, setStaffName] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [memo, setMemo] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    try {
      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const queryCustomerId = searchParams.get("customer_id") || "";
      const queryVisitId = searchParams.get("visit_id") || "";
      const queryVisitDate = searchParams.get("visit_date") || "";
      const queryMenuName = searchParams.get("menu_name") || "";
      const queryStaffName = searchParams.get("staff_name") || "";

      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("id,name,phone")
        .order("name", { ascending: true });

      if (customersError) throw customersError;

      setCustomers((customersData as Customer[]) || []);
      setCustomerId(queryCustomerId);
      setVisitId(queryVisitId);
      setSaleDate(queryVisitDate || todayString());
      setMenuName(queryMenuName);
      setStaffName(queryStaffName);

      if (queryVisitId) {
        const { data: visitData, error: visitError } = await supabase
          .from("visits")
          .select("id,customer_id,visit_date,menu_name,staff_name,memo")
          .eq("id", queryVisitId)
          .single();

        if (!visitError && visitData) {
          const visitRow = visitData as Visit;
          setVisit(visitRow);
          setCustomerId(visitRow.customer_id || queryCustomerId || "");
          setSaleDate(extractDateOnly(visitRow.visit_date) || queryVisitDate || todayString());
          setMenuName(visitRow.menu_name || queryMenuName || "");
          setStaffName(visitRow.staff_name || queryStaffName || "");
          setMemo(visitRow.memo || "");
        }
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "初期データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === customerId) || null;
  }, [customers, customerId]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!customerId) {
      setErrorMessage("顧客を選択してください。");
      return;
    }

    if (!saleDate) {
      setErrorMessage("売上日を入力してください。");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      setErrorMessage("売上金額を正しく入力してください。");
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const numericAmount = Number(amount);

      const insertPayload = {
        customer_id: customerId,
        visit_id: visitId || null,
        sale_date: saleDate,
        menu_name: menuName || null,
        staff_name: staffName || null,
        amount: numericAmount,
        payment_method: paymentMethod || null,
        memo: memo || null,
      };

      const { error } = await supabase.from("sales").insert([insertPayload]);

      if (error) {
        throw error;
      }

      setSuccessMessage("売上登録が完了しました。");
      setTimeout(() => {
        router.push("/sales-payments");
      }, 700);
    } catch (error: any) {
      setErrorMessage(
        error?.message ||
          "売上登録に失敗しました。sales テーブルの列名が違う場合は insertPayload の列名だけ合わせてください。"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">売上登録</h1>
        <p className="mt-1 text-sm text-gray-600">
          来店登録から来た場合は、顧客・来店日・メニュー・担当者を自動反映します。
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          読み込み中...
        </div>
      ) : (
        <>
          {errorMessage ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {successMessage}
            </div>
          ) : null}

          {visit ? (
            <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="mb-3 text-base font-semibold text-amber-900">
                来店情報から自動反映
              </h2>
              <div className="space-y-1 text-sm text-amber-900">
                <p>
                  <span className="font-medium">来店ID：</span>
                  {visit.id}
                </p>
                <p>
                  <span className="font-medium">来店日：</span>
                  {extractDateOnly(visit.visit_date) || "未設定"}
                </p>
                <p>
                  <span className="font-medium">メニュー：</span>
                  {visit.menu_name || "未設定"}
                </p>
                <p>
                  <span className="font-medium">担当：</span>
                  {visit.staff_name || "未設定"}
                </p>
              </div>
            </section>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5">
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">売上情報</h2>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">顧客</label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                  >
                    <option value="">顧客を選択してください</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name || "名称未設定"}
                        {customer.phone ? ` / ${customer.phone}` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedCustomer ? (
                    <p className="mt-2 text-xs text-green-700">
                      選択中: {selectedCustomer.name || "名称未設定"}
                      {selectedCustomer.phone ? ` / ${selectedCustomer.phone}` : ""}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">売上日</label>
                  <input
                    type="date"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">メニュー名</label>
                  <input
                    type="text"
                    value={menuName}
                    onChange={(e) => setMenuName(e.target.value)}
                    placeholder="例：ワンカラー / 定額デザイン"
                    className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">担当スタッフ名</label>
                  <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="例：Akane"
                    className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">売上金額</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="例：8000"
                    className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">支払方法</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                  >
                    <option value="cash">現金</option>
                    <option value="card">カード</option>
                    <option value="transfer">振込</option>
                    <option value="other">その他</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">メモ</h2>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={5}
                placeholder="備考、支払状況、施術メモなど"
                className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
              />
            </section>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium"
              >
                戻る
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "登録中..." : "売上登録する"}
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}

function extractDateOnly(value?: string | null) {
  if (!value) return "";
  const text = String(value);
  if (text.includes("T")) return text.split("T")[0];
  return text.slice(0, 10);
}

function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}