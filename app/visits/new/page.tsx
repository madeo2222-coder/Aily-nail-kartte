"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
};

type CustomerIntake = {
  id: string;
  customer_id: string | null;
  name: string | null;
  phone: string | null;
  allergy: string | null;
  ng_items: string | null;
  agreed: boolean | null;
  signature_name: string | null;
  signature_data_url: string | null;
  created_at?: string | null;
};

export default function NewVisitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [intakes, setIntakes] = useState<CustomerIntake[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [visitDate, setVisitDate] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [menuName, setMenuName] = useState("");
  const [staffName, setStaffName] = useState("");
  const [memo, setMemo] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [createdVisitId, setCreatedVisitId] = useState("");

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    const queryCustomerId = searchParams.get("customer_id") || "";
    if (!queryCustomerId || customers.length === 0) return;

    const exists = customers.some((customer) => customer.id === queryCustomerId);
    if (exists) {
      setCustomerId(queryCustomerId);
    }
  }, [searchParams, customers]);

  async function fetchInitialData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const [{ data: customersData, error: customersError }, { data: intakesData, error: intakesError }] =
        await Promise.all([
          supabase.from("customers").select("id,name,phone").order("name", { ascending: true }),
          supabase
            .from("customer_intakes")
            .select(
              "id,customer_id,name,phone,allergy,ng_items,agreed,signature_name,signature_data_url,created_at"
            )
            .order("created_at", { ascending: false }),
        ]);

      if (customersError) throw customersError;
      if (intakesError) throw intakesError;

      setCustomers((customersData as Customer[]) || []);
      setIntakes((intakesData as CustomerIntake[]) || []);
    } catch (error: any) {
      setErrorMessage(error?.message || "初期データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === customerId) || null;
  }, [customers, customerId]);

  const matchedIntake = useMemo(() => {
    if (!selectedCustomer) return null;

    const normalizedCustomerPhone = normalizePhone(selectedCustomer.phone);
    const normalizedCustomerName = normalizeText(selectedCustomer.name);

    const linkedByCustomerId = intakes.find(
      (intake) => intake.customer_id && intake.customer_id === selectedCustomer.id
    );
    if (linkedByCustomerId) return linkedByCustomerId;

    const linkedByPhone = intakes.find((intake) => {
      const normalizedIntakePhone = normalizePhone(intake.phone);
      return !!normalizedCustomerPhone && !!normalizedIntakePhone && normalizedCustomerPhone === normalizedIntakePhone;
    });
    if (linkedByPhone) return linkedByPhone;

    const linkedByNameAndPhone = intakes.find((intake) => {
      const normalizedIntakePhone = normalizePhone(intake.phone);
      const normalizedIntakeName = normalizeText(intake.name);
      return (
        !!normalizedCustomerPhone &&
        !!normalizedIntakePhone &&
        normalizedCustomerPhone === normalizedIntakePhone &&
        !!normalizedCustomerName &&
        !!normalizedIntakeName &&
        normalizedCustomerName === normalizedIntakeName
      );
    });

    return linkedByNameAndPhone || null;
  }, [selectedCustomer, intakes]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!customerId) {
      setErrorMessage("顧客を選択してください。");
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      setCreatedVisitId("");

      const insertPayload = {
        customer_id: customerId,
        visit_date: visitDate,
        menu_name: menuName || null,
        staff_name: staffName || null,
        memo: buildVisitMemo(memo, matchedIntake),
      };

      const { data, error } = await supabase
        .from("visits")
        .insert([insertPayload])
        .select("id")
        .single();

      if (error) throw error;

      setCreatedVisitId(data?.id || "");
      setSuccessMessage("来店登録が完了しました。続けて売上登録に進めます。");
    } catch (error: any) {
      setErrorMessage(error?.message || "来店登録に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  function goToSalesPayment() {
    const params = new URLSearchParams();

    if (customerId) params.set("customer_id", customerId);
    if (createdVisitId) params.set("visit_id", createdVisitId);
    if (visitDate) params.set("visit_date", visitDate);
    if (menuName) params.set("menu_name", menuName);
    if (staffName) params.set("staff_name", staffName);

    router.push(`/sales-payments?${params.toString()}`);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">来店登録</h1>
        <p className="mt-1 text-sm text-gray-600">
          顧客選択時に、初回入力情報があれば自動で表示します。
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">読み込み中...</div>
      ) : (
        <>
          {errorMessage ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              <div className="font-medium">{successMessage}</div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={goToSalesPayment}
                  className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white"
                >
                  売上登録へ進む
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/visits")}
                  className="rounded-xl border px-4 py-3 text-sm font-medium"
                >
                  来店一覧へ戻る
                </button>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5">
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">基本情報</h2>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">顧客</label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                    disabled={!!createdVisitId}
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
                  <label className="mb-2 block text-sm font-medium">来店日</label>
                  <input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                    disabled={!!createdVisitId}
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
                    disabled={!!createdVisitId}
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
                    disabled={!!createdVisitId}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">初回入力情報</h2>

              {!customerId ? (
                <div className="rounded-xl border bg-gray-50 p-3 text-sm text-gray-600">
                  先に顧客を選択してください。
                </div>
              ) : matchedIntake ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="mb-2 text-sm font-semibold text-amber-900">施術前チェック</div>
                    <div className="space-y-2 text-sm text-amber-900">
                      <p>
                        <span className="font-medium">アレルギー：</span>
                        {matchedIntake.allergy?.trim() ? matchedIntake.allergy : "なし"}
                      </p>
                      <p>
                        <span className="font-medium">NG項目：</span>
                        {matchedIntake.ng_items?.trim() ? matchedIntake.ng_items : "なし"}
                      </p>
                      <p>
                        <span className="font-medium">注意事項同意：</span>
                        {matchedIntake.agreed ? "済み" : "未確認"}
                      </p>
                      <p>
                        <span className="font-medium">署名名：</span>
                        {matchedIntake.signature_name?.trim() ? matchedIntake.signature_name : "未入力"}
                      </p>
                    </div>
                  </div>

                  {matchedIntake.signature_data_url ? (
                    <div>
                      <div className="mb-2 text-sm font-medium">署名</div>
                      <div className="overflow-hidden rounded-xl border bg-white p-2">
                        <img
                          src={matchedIntake.signature_data_url}
                          alt="署名"
                          className="max-h-40 w-auto"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  この顧客に紐づく初回入力情報は見つかりませんでした。
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">来店メモ</h2>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={6}
                placeholder="施術内容、注意点、次回提案など"
                className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                disabled={!!createdVisitId}
              />
              <p className="mt-2 text-xs text-gray-500">
                初回情報がある場合は、登録時にメモ末尾へ自動追記されます。
              </p>
            </section>

            {!createdVisitId ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/visits")}
                  className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium"
                >
                  戻る
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "登録中..." : "来店登録する"}
                </button>
              </div>
            ) : null}
          </form>
        </>
      )}
    </main>
  );
}

function normalizePhone(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function buildVisitMemo(baseMemo: string, intake: CustomerIntake | null) {
  const trimmedBase = (baseMemo || "").trim();

  if (!intake) return trimmedBase || null;

  const autoLines = [
    "",
    "【初回入力情報】",
    `アレルギー: ${intake.allergy?.trim() ? intake.allergy : "なし"}`,
    `NG項目: ${intake.ng_items?.trim() ? intake.ng_items : "なし"}`,
    `注意事項同意: ${intake.agreed ? "済み" : "未確認"}`,
    `署名名: ${intake.signature_name?.trim() ? intake.signature_name : "未入力"}`,
  ].join("\n");

  const merged = `${trimmedBase}${autoLines}`.trim();
  return merged || null;
}