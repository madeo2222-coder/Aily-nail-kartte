"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

export default function CustomerIntakeListPage() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [intakes, setIntakes] = useState<CustomerIntake[]>([]);
  const [search, setSearch] = useState("");
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setErrorMessage("");
      setMessage("");

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

      const customerRows = (customersData as Customer[]) || [];
      const intakeRows = (intakesData as CustomerIntake[]) || [];

      setCustomers(customerRows);
      setIntakes(intakeRows);

      const nextSelections: Record<string, string> = {};
      intakeRows.forEach((intake) => {
        nextSelections[intake.id] = intake.customer_id || suggestCustomerId(intake, customerRows) || "";
      });
      setLinkSelections(nextSelections);
    } catch (error: any) {
      setErrorMessage(error?.message || "初回入力一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  const filteredIntakes = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return intakes;

    return intakes.filter((intake) => {
      const createdAtText = formatDateTime(intake.created_at).toLowerCase();
      return (
        (intake.name || "").toLowerCase().includes(keyword) ||
        (intake.phone || "").toLowerCase().includes(keyword) ||
        (intake.allergy || "").toLowerCase().includes(keyword) ||
        (intake.ng_items || "").toLowerCase().includes(keyword) ||
        createdAtText.includes(keyword)
      );
    });
  }, [intakes, search]);

  const stats = useMemo(() => {
    const total = intakes.length;
    const linked = intakes.filter((item) => !!item.customer_id).length;
    const unlinked = total - linked;
    return { total, linked, unlinked };
  }, [intakes]);

  async function handleLink(intakeId: string) {
    const selectedCustomerId = linkSelections[intakeId] || "";

    if (!selectedCustomerId) {
      setErrorMessage("紐付け先の顧客を選択してください。");
      return;
    }

    try {
      setSavingId(intakeId);
      setErrorMessage("");
      setMessage("");

      const { error } = await supabase
        .from("customer_intakes")
        .update({ customer_id: selectedCustomerId })
        .eq("id", intakeId);

      if (error) throw error;

      setIntakes((prev) =>
        prev.map((item) =>
          item.id === intakeId ? { ...item, customer_id: selectedCustomerId } : item
        )
      );

      setMessage("顧客との紐付けを保存しました。");
    } catch (error: any) {
      setErrorMessage(error?.message || "紐付け保存に失敗しました。");
    } finally {
      setSavingId("");
    }
  }

  async function handleUnlink(intakeId: string) {
    const ok = window.confirm("この初回入力の顧客紐付けを解除しますか？");
    if (!ok) return;

    try {
      setSavingId(intakeId);
      setErrorMessage("");
      setMessage("");

      const { error } = await supabase
        .from("customer_intakes")
        .update({ customer_id: null })
        .eq("id", intakeId);

      if (error) throw error;

      const currentIntake = intakes.find((item) => item.id === intakeId) || null;

      setIntakes((prev) =>
        prev.map((item) =>
          item.id === intakeId ? { ...item, customer_id: null } : item
        )
      );

      setLinkSelections((prev) => ({
        ...prev,
        [intakeId]: currentIntake ? suggestCustomerId(currentIntake, customers) || "" : "",
      }));

      setMessage("顧客紐付けを解除しました。");
    } catch (error: any) {
      setErrorMessage(error?.message || "紐付け解除に失敗しました。");
    } finally {
      setSavingId("");
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">初回入力一覧</h1>
          <p className="mt-1 text-sm text-gray-600">
            未連携データを顧客に手動で紐付けできます。
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/staff-tools"
            className="rounded-xl border px-4 py-2 text-sm font-medium"
          >
            スタッフツールへ
          </Link>
          <Link
            href="/intake-lookup"
            className="rounded-xl border px-4 py-2 text-sm font-medium"
          >
            初回確認へ
          </Link>
        </div>
      </div>

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">総件数</div>
          <div className="mt-1 text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">紐付け済み</div>
          <div className="mt-1 text-2xl font-bold">{stats.linked}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">未連携</div>
          <div className="mt-1 text-2xl font-bold">{stats.unlinked}</div>
        </div>
      </section>

      <section className="mb-5 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-medium">検索</label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="名前・電話番号・アレルギー・NG項目で検索"
          className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
        />
      </section>

      {message ? (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
          読み込み中...
        </div>
      ) : filteredIntakes.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          該当する初回入力データはありません。
        </div>
      ) : (
        <div className="space-y-4">
          {filteredIntakes.map((intake) => {
            const linkedCustomer =
              customers.find((customer) => customer.id === intake.customer_id) || null;

            const suggestedCustomerId = suggestCustomerId(intake, customers);
            const currentSelection = linkSelections[intake.id] || "";

            return (
              <section
                key={intake.id}
                className="rounded-2xl border bg-white p-4 shadow-sm"
              >
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold">
                      {intake.name || "名前未入力"}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      電話番号: {intake.phone || "未入力"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      登録日時: {formatDateTime(intake.created_at)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {linkedCustomer ? (
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                        紐付け済み
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                        未連携
                      </span>
                    )}

                    {suggestedCustomerId && !linkedCustomer ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                        候補あり
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-3">
                    <div className="rounded-xl border bg-gray-50 p-3 text-sm">
                      <div className="mb-2 font-medium">初回情報</div>
                      <div className="space-y-1 text-gray-700">
                        <p>
                          <span className="font-medium">アレルギー:</span>{" "}
                          {intake.allergy?.trim() ? intake.allergy : "なし"}
                        </p>
                        <p>
                          <span className="font-medium">NG項目:</span>{" "}
                          {intake.ng_items?.trim() ? intake.ng_items : "なし"}
                        </p>
                        <p>
                          <span className="font-medium">注意事項同意:</span>{" "}
                          {intake.agreed ? "済み" : "未確認"}
                        </p>
                        <p>
                          <span className="font-medium">署名名:</span>{" "}
                          {intake.signature_name?.trim()
                            ? intake.signature_name
                            : "未入力"}
                        </p>
                      </div>
                    </div>

                    {intake.signature_data_url ? (
                      <div className="rounded-xl border bg-white p-3">
                        <div className="mb-2 text-sm font-medium">署名</div>
                        <img
                          src={intake.signature_data_url}
                          alt="署名"
                          className="max-h-40 w-auto"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border bg-white p-3">
                      <div className="mb-2 text-sm font-medium">現在の紐付け</div>

                      {linkedCustomer ? (
                        <div className="text-sm text-gray-700">
                          <div>{linkedCustomer.name || "名称未設定"}</div>
                          <div className="text-xs text-gray-500">
                            {linkedCustomer.phone || "電話番号未入力"}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-red-600">
                          まだ顧客に紐付いていません
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border bg-white p-3">
                      <label className="mb-2 block text-sm font-medium">
                        紐付け先の顧客
                      </label>
                      <select
                        value={currentSelection}
                        onChange={(e) =>
                          setLinkSelections((prev) => ({
                            ...prev,
                            [intake.id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
                      >
                        <option value="">顧客を選択してください</option>
                        {customers.map((customer) => {
                          const isSuggested = customer.id === suggestedCustomerId;
                          return (
                            <option key={customer.id} value={customer.id}>
                              {isSuggested ? "★ " : ""}
                              {customer.name || "名称未設定"}
                              {customer.phone ? ` / ${customer.phone}` : ""}
                            </option>
                          );
                        })}
                      </select>

                      {suggestedCustomerId ? (
                        <p className="mt-2 text-xs text-amber-700">
                          電話番号または名前から候補を自動提案しています。
                        </p>
                      ) : null}

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleLink(intake.id)}
                          disabled={savingId === intake.id}
                          className="flex-1 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {savingId === intake.id ? "保存中..." : "紐付け保存"}
                        </button>

                        {linkedCustomer ? (
                          <button
                            type="button"
                            onClick={() => handleUnlink(intake.id)}
                            disabled={savingId === intake.id}
                            className="rounded-xl border px-4 py-3 text-sm font-medium disabled:opacity-50"
                          >
                            解除
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
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

function suggestCustomerId(
  intake: CustomerIntake,
  customers: Customer[]
): string {
  const intakePhone = normalizePhone(intake.phone);
  const intakeName = normalizeText(intake.name);

  const phoneMatched = customers.find((customer) => {
    const customerPhone = normalizePhone(customer.phone);
    return !!intakePhone && !!customerPhone && intakePhone === customerPhone;
  });
  if (phoneMatched) return phoneMatched.id;

  const nameMatched = customers.find((customer) => {
    const customerName = normalizeText(customer.name);
    return !!intakeName && !!customerName && intakeName === customerName;
  });
  if (nameMatched) return nameMatched.id;

  return "";
}

function formatDateTime(value?: string | null) {
  if (!value) return "日時不明";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}