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

export default function IntakeLookupPage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [keyword, setKeyword] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [intakes, setIntakes] = useState<CustomerIntake[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
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
      setErrorMessage(error?.message || "初回情報の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  const filteredIntakes = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    const enriched = intakes.map((intake) => {
      const linkedCustomer =
        customers.find((customer) => customer.id === intake.customer_id) ||
        findSuggestedCustomer(intake, customers);

      return {
        ...intake,
        linkedCustomer,
      };
    });

    if (!q) return enriched;

    return enriched.filter((item) => {
      return (
        (item.name || "").toLowerCase().includes(q) ||
        (item.phone || "").toLowerCase().includes(q) ||
        (item.allergy || "").toLowerCase().includes(q) ||
        (item.ng_items || "").toLowerCase().includes(q) ||
        (item.signature_name || "").toLowerCase().includes(q) ||
        (item.linkedCustomer?.name || "").toLowerCase().includes(q) ||
        (item.linkedCustomer?.phone || "").toLowerCase().includes(q)
      );
    });
  }, [keyword, intakes, customers]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">初回情報確認</h1>
          <p className="mt-1 text-sm text-gray-600">
            施術前にアレルギー・NG項目・署名を確認できます。
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/staff"
            className="rounded-xl border px-4 py-2 text-sm font-medium"
          >
            スタッフ画面へ
          </Link>
          <Link
            href="/customer-intake/list"
            className="rounded-xl border px-4 py-2 text-sm font-medium"
          >
            初回一覧へ
          </Link>
        </div>
      </div>

      <section className="mb-5 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-medium">検索</label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="名前・電話番号・アレルギー・NG項目で検索"
          className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
        />
        <p className="mt-2 text-xs text-gray-500">
          名前または電話番号で探す運用がおすすめです。
        </p>
      </section>

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
          該当する初回情報はありません。
        </div>
      ) : (
        <div className="space-y-4">
          {filteredIntakes.map((item) => {
            const linkedCustomer = item.linkedCustomer || null;

            return (
              <section
                key={item.id}
                className="rounded-2xl border bg-white p-4 shadow-sm"
              >
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold">
                      {item.name || "名前未入力"}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      電話番号: {item.phone || "未入力"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      登録日時: {formatDateTime(item.created_at)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {linkedCustomer ? (
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                        顧客連携あり
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                        顧客未連携
                      </span>
                    )}
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                      {item.agreed ? "注意事項同意済み" : "同意未確認"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="mb-2 text-sm font-semibold text-amber-900">
                        施術前チェック
                      </div>
                      <div className="space-y-2 text-sm text-amber-900">
                        <p>
                          <span className="font-medium">アレルギー：</span>
                          {item.allergy?.trim() ? item.allergy : "なし"}
                        </p>
                        <p>
                          <span className="font-medium">NG項目：</span>
                          {item.ng_items?.trim() ? item.ng_items : "なし"}
                        </p>
                        <p>
                          <span className="font-medium">署名名：</span>
                          {item.signature_name?.trim() ? item.signature_name : "未入力"}
                        </p>
                      </div>
                    </div>

                    {item.signature_data_url ? (
                      <div className="rounded-xl border bg-white p-3">
                        <div className="mb-2 text-sm font-medium">署名</div>
                        <img
                          src={item.signature_data_url}
                          alt="署名"
                          className="max-h-40 w-auto"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border bg-gray-50 p-3">
                      <div className="mb-2 text-sm font-medium">顧客情報</div>

                      {linkedCustomer ? (
                        <div className="text-sm text-gray-700">
                          <div>{linkedCustomer.name || "名称未設定"}</div>
                          <div className="text-xs text-gray-500">
                            {linkedCustomer.phone || "電話番号未入力"}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-red-600">
                          紐付いている顧客がありません
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border bg-white p-3">
                      <div className="mb-3 text-sm font-medium">操作</div>

                      <div className="flex flex-col gap-2">
                        {linkedCustomer ? (
                          <>
                            <Link
                              href={`/customers/${linkedCustomer.id}`}
                              className="rounded-xl border px-4 py-3 text-center text-sm font-medium"
                            >
                              顧客詳細を見る
                            </Link>

                            <Link
                              href={`/visits/new?customer_id=${linkedCustomer.id}`}
                              className="rounded-xl bg-black px-4 py-3 text-center text-sm font-medium text-white"
                            >
                              この顧客で来店登録
                            </Link>
                          </>
                        ) : (
                          <Link
                            href="/customer-intake/list"
                            className="rounded-xl border px-4 py-3 text-center text-sm font-medium"
                          >
                            一覧で顧客紐付けする
                          </Link>
                        )}

                        <Link
                          href="/customer-intake/list"
                          className="rounded-xl border px-4 py-3 text-center text-sm font-medium"
                        >
                          初回一覧へ戻る
                        </Link>
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

function findSuggestedCustomer(
  intake: CustomerIntake,
  customers: Customer[]
): Customer | null {
  const intakePhone = normalizePhone(intake.phone);
  const intakeName = normalizeText(intake.name);

  const phoneMatched = customers.find((customer) => {
    const customerPhone = normalizePhone(customer.phone);
    return !!intakePhone && !!customerPhone && intakePhone === customerPhone;
  });
  if (phoneMatched) return phoneMatched;

  const nameMatched = customers.find((customer) => {
    const customerName = normalizeText(customer.name);
    return !!intakeName && !!customerName && intakeName === customerName;
  });
  if (nameMatched) return nameMatched;

  return null;
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