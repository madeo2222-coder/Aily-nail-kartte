"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone");

      if (error) {
        throw error;
      }

      setCustomers((data as Customer[]) ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "顧客一覧の取得に失敗しました。"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return customers;

    return customers.filter((customer) => {
      const name = (customer.name ?? "").toLowerCase();
      const phone = (customer.phone ?? "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [customers, keyword]);

  const handleDelete = async (customer: Customer) => {
    const confirmed = window.confirm(
      `「${customer.name ?? "名称未設定"}」を削除しますか？\nこの操作は元に戻せません。`
    );

    if (!confirmed) return;

    try {
      setDeletingId(customer.id);

      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", customer.id);

      if (error) {
        throw error;
      }

      setCustomers((prev) => prev.filter((item) => item.id !== customer.id));
      window.alert("削除しました。");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "削除に失敗しました。"
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#fcf8f7] px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#111827]">顧客一覧</h1>
          <p className="mt-2 text-base text-gray-600">
            登録済みの顧客を確認できます
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchCustomers}
            className="rounded-2xl border border-gray-300 bg-white px-6 py-4 text-lg font-semibold text-[#111827]"
          >
            再読み込み
          </button>

          <Link
            href="/customer-intake"
            className="rounded-2xl bg-black px-6 py-4 text-lg font-semibold text-white"
          >
            新規顧客登録
          </Link>
        </div>

        <div className="mb-8 rounded-3xl border border-[#e5e7eb] bg-white p-6">
          <label className="mb-3 block text-xl font-semibold text-[#111827]">
            顧客検索
          </label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="名前 または 電話番号で検索"
            className="w-full rounded-2xl border border-gray-300 px-5 py-4 text-lg outline-none focus:border-black"
          />
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-[#e5e7eb] bg-white p-6 text-gray-600">
            読み込み中...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="rounded-3xl border border-[#e5e7eb] bg-white p-6 text-gray-600">
            顧客が見つかりません。
          </div>
        ) : (
          <div className="space-y-6">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="rounded-3xl border border-[#e5e7eb] bg-white p-6"
              >
                <div className="mb-6 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-lg text-gray-500">名前</div>
                    <div className="text-2xl font-bold text-[#111827]">
                      {customer.name || "未登録"}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-lg text-gray-500">電話番号</div>
                    <div className="text-2xl font-medium text-[#111827]">
                      {customer.phone || "未登録"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="rounded-2xl border border-gray-300 bg-white px-6 py-4 text-lg font-semibold text-[#111827]"
                  >
                    詳細を見る
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleDelete(customer)}
                    disabled={deletingId === customer.id}
                    className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-lg font-semibold text-red-600 disabled:opacity-50"
                  >
                    {deletingId === customer.id ? "削除中..." : "削除"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}