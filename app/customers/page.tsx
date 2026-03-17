"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
  created_at?: string | null;
};

export default function CustomersPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setCustomers([]);
      setErrorMessage(error.message || "顧客一覧の取得に失敗しました。");
      setLoading(false);
      return;
    }

    setCustomers((data ?? []) as Customer[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return customers;

    return customers.filter((customer) => {
      const name = (customer.name ?? "").toLowerCase();
      const phone = (customer.phone ?? "").toLowerCase();
      return name.includes(keyword) || phone.includes(keyword);
    });
  }, [customers, search]);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">顧客一覧</h1>
            <p className="mt-1 text-sm text-neutral-600">
              登録済みの顧客を確認できます
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fetchCustomers()}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              再読み込み
            </button>

            <button
              type="button"
              onClick={() => router.push("/customers/new")}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              新規顧客登録
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
          <label className="mb-2 block text-sm font-medium text-neutral-700">
            顧客検索
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名前 または 電話番号で検索"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-500"
          />
        </div>

        {loading ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            読み込み中です...
          </div>
        ) : errorMessage ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <p className="text-sm text-neutral-600">
              {search.trim()
                ? "検索条件に一致する顧客がいません。"
                : "まだ顧客が登録されていません。"}
            </p>

            {!search.trim() && (
              <button
                type="button"
                onClick={() => router.push("/customers/new")}
                className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                最初の顧客を登録する
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="hidden grid-cols-12 gap-4 border-b border-neutral-200 bg-neutral-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 md:grid">
              <div className="col-span-5">名前</div>
              <div className="col-span-4">電話番号</div>
              <div className="col-span-3">詳細</div>
            </div>

            <div className="divide-y divide-neutral-200">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-12 md:items-center"
                >
                  <div className="md:col-span-5">
                    <p className="text-xs text-neutral-500 md:hidden">名前</p>
                    <p className="text-sm font-semibold text-neutral-900">
                      {customer.name?.trim() ? customer.name : "名前未登録"}
                    </p>
                  </div>

                  <div className="md:col-span-4">
                    <p className="text-xs text-neutral-500 md:hidden">電話番号</p>
                    <p className="text-sm text-neutral-700">
                      {customer.phone?.trim() ? customer.phone : "-"}
                    </p>
                  </div>

                  <div className="md:col-span-3">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      詳細を見る
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}