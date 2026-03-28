"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

export default function NewVisitPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const preselectedCustomerId = searchParams.get("customer_id") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  const [customerId, setCustomerId] = useState(preselectedCustomerId);
  const [visitDate, setVisitDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [menuName, setMenuName] = useState("");
  const [price, setPrice] = useState("");
  const [memo, setMemo] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextProposal, setNextProposal] = useState("");
  const [staffName, setStaffName] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!preselectedCustomerId) return;
    setCustomerId(preselectedCustomerId);
  }, [preselectedCustomerId]);

  async function fetchCustomers() {
    setLoadingCustomers(true);

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone")
      .order("name", { ascending: true });

    if (error) {
      console.error("customers取得エラー:", error);
      setMessage("顧客一覧の取得に失敗しました");
      setLoadingCustomers(false);
      return;
    }

    setCustomers(data || []);
    setLoadingCustomers(false);
  }

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === customerId) || null;
  }, [customers, customerId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!customerId) {
      setMessage("顧客を選択してください");
      return;
    }

    if (!visitDate) {
      setMessage("来店日を入力してください");
      return;
    }

    if (!price || Number(price) < 0) {
      setMessage("金額を正しく入力してください");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        customer_id: customerId,
        visit_date: visitDate,
        menu_name: menuName.trim() || null,
        price: Number(price),
        memo: memo.trim() || null,
        next_visit_date: nextVisitDate || null,
        next_proposal: nextProposal.trim() || null,
        staff_name: staffName.trim() || null,
      };

      const { error } = await supabase.from("visits").insert([payload]);

      if (error) {
        console.error("visits insert error:", error);
        setMessage(`来店履歴の登録に失敗しました: ${error.message}`);
        setSaving(false);
        return;
      }

      alert("来店履歴を登録しました");
      router.push(`/customers/${customerId}`);
    } catch (error) {
      console.error("来店登録エラー:", error);
      setMessage("来店履歴の登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 pb-24">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/visits" className="text-sm text-gray-600 underline">
            ← 来店一覧に戻る
          </Link>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold">来店履歴を追加</h1>
          <p className="mt-2 text-sm text-gray-600">
            顧客を選択して、来店履歴を登録します。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">顧客情報</h2>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                顧客 <span className="text-red-500">*</span>
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-xl border px-3 py-3 text-sm"
              >
                <option value="">
                  {loadingCustomers ? "読み込み中..." : "顧客を選択してください"}
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.phone ? ` / ${customer.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomer ? (
              <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                <p>顧客名: {selectedCustomer.name}</p>
                <p>電話番号: {selectedCustomer.phone || "-"}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">来店情報</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  来店日 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  メニュー
                </label>
                <input
                  type="text"
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  placeholder="例: ワンカラー / 定額デザイン"
                  className="w-full rounded-xl border px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  金額 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="例: 6800"
                  className="w-full rounded-xl border px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  メモ
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={4}
                  placeholder="施術内容、会話メモ、注意点など"
                  className="w-full rounded-xl border px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  次回来店日
                </label>
                <input
                  type="date"
                  value={nextVisitDate}
                  onChange={(e) => setNextVisitDate(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  次回提案
                </label>
                <textarea
                  value={nextProposal}
                  onChange={(e) => setNextProposal(e.target.value)}
                  rows={3}
                  placeholder="次回おすすめメニュー、色、デザイン提案など"
                  className="w-full rounded-xl border px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  担当スタッフ
                </label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="例: あかね"
                  className="w-full rounded-xl border px-3 py-3 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-black px-4 py-4 text-lg font-bold text-white disabled:opacity-50"
            >
              {saving ? "保存中..." : "来店履歴を保存する"}
            </button>

            {message ? (
              <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                {message}
              </div>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}