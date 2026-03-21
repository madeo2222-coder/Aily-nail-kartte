"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name?: string | null;
  phone?: string | null;
  created_at?: string | null;
};

function isIgnorableDeleteError(error: any) {
  const message = error?.message || "";
  const code = error?.code || "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("Could not find the table") ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("invalid input syntax for type bigint")
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    setLoading(true);

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("customers fetch error:", error);
      setCustomers([]);
      setLoading(false);
      return;
    }

    setCustomers((data as Customer[]) || []);
    setLoading(false);
  }

  async function safeDeleteByCustomerId(tableName: string, customerId: string) {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("customer_id", customerId);

    if (error && !isIgnorableDeleteError(error)) {
      throw error;
    }
  }

  async function safeDeleteByPhone(tableName: string, phone: string) {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("phone", phone);

    if (error && !isIgnorableDeleteError(error)) {
      throw error;
    }
  }

  async function handleDelete(customer: Customer) {
    const confirmed = window.confirm(
      `「${customer.name || "名称未設定"}」を削除しますか？\nこの操作は元に戻せません。`
    );

    if (!confirmed) return;

    try {
      setDeletingId(customer.id);

      // まず phone 紐付けの旧導線を先に削除
      if (customer.phone) {
        await safeDeleteByPhone("customer_intakes", customer.phone);
        await safeDeleteByPhone("customer_intake", customer.phone);
      }

      // UUIDで消せる関連データを削除
      await safeDeleteByCustomerId("visits", customer.id);
      await safeDeleteByCustomerId("reservations", customer.id);
      await safeDeleteByCustomerId("customer_intakes", customer.id);
      await safeDeleteByCustomerId("customer_intake", customer.id);

      // 最後に顧客本体を必ず削除
      const { error: customerDeleteError } = await supabase
        .from("customers")
        .delete()
        .eq("id", customer.id);

      if (customerDeleteError) {
        console.error("customer delete error:", customerDeleteError);
        alert(`削除に失敗しました。\n${customerDeleteError.message}`);
        return;
      }

      // 画面上から即消す
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      alert("削除しました。");
    } catch (error: any) {
      console.error("delete failed:", error);
      alert(`削除に失敗しました。\n${error?.message || "不明なエラー"}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="text-3xl font-bold mb-6">顧客一覧</h1>

      <div className="mb-6">
        <Link
          href="/customers/new"
          className="block w-full rounded-xl bg-black px-4 py-4 text-center text-white text-xl font-bold"
        >
          ＋ 顧客登録
        </Link>
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : customers.length === 0 ? (
        <div className="rounded-xl border bg-white p-4">
          <p>顧客データがまだありません。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {customers.map((customer) => (
            <div key={customer.id} className="rounded-2xl border bg-white p-5">
              <p className="mb-2 text-sm text-gray-500">名前</p>
              <p className="mb-6 break-words text-2xl font-bold">
                {customer.name || "未入力"}
              </p>

              <p className="mb-2 text-sm text-gray-500">電話番号</p>
              <p className="mb-6 break-all text-2xl font-bold">
                {customer.phone || "未入力"}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Link
                  href={`/customers/${customer.id}`}
                  className="rounded-xl border px-4 py-4 text-center text-xl font-bold"
                >
                  詳細を見る
                </Link>

                <button
                  type="button"
                  onClick={() => handleDelete(customer)}
                  disabled={deletingId === customer.id}
                  className="rounded-xl border border-red-300 px-4 py-4 text-center text-xl font-bold text-red-600 disabled:opacity-50"
                >
                  {deletingId === customer.id ? "削除中..." : "削除"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}