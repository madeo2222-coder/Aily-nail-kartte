"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

type Customer = {
  id: string;
  name: string;
};

export default function NewVisitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [visitDate, setVisitDate] = useState("");
  const [price, setPrice] = useState("");
  const [memo, setMemo] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextProposal, setNextProposal] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    fetchCustomers();

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setVisitDate(`${yyyy}-${mm}-${dd}`);

    const customerIdFromQuery = searchParams.get("customer_id");
    if (customerIdFromQuery) {
      setSelectedCustomerId(customerIdFromQuery);
    }
  }, [mounted, searchParams]);

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("顧客取得エラー:", error);
      alert("顧客一覧の取得に失敗しました");
      return;
    }

    setCustomers(data || []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedCustomerId) {
      alert("顧客を選択してください");
      return;
    }

    if (!visitDate) {
      alert("来店日を入力してください");
      return;
    }

    setLoading(true);

    const insertData = {
      customer_id: selectedCustomerId,
      visit_date: visitDate,
      price: price ? Number(price) : 0,
      memo: memo || null,
      next_visit_date: nextVisitDate || null,
      next_proposal: nextProposal || null,
      next_suggestion: nextProposal || null,
    };

    console.log("insertData:", insertData);

    const { error } = await supabase.from("visits").insert([insertData]);

    setLoading(false);

    if (error) {
      console.error("来店登録エラー:", error);
      alert(`来店履歴の保存に失敗しました: ${error.message}`);
      return;
    }

    alert("来店履歴を保存しました");
    router.push(`/customers/${selectedCustomerId}`);
  }

  if (!mounted) {
    return null;
  }

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">来店履歴を追加</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-2xl shadow p-4">
          <label className="block text-sm font-medium mb-2">顧客</label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full border rounded-xl px-4 py-3"
          >
            <option value="">顧客を選択してください</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-2xl shadow p-4">
          <label className="block text-sm font-medium mb-2">来店日</label>
          <input
            type="date"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            className="w-full border rounded-xl px-4 py-3"
          />
        </div>

        <div className="bg-white rounded-2xl shadow p-4">
          <label className="block text-sm font-medium mb-2">売上</label>
          <input
            type="number"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="例）6500"
            className="w-full border rounded-xl px-4 py-3"
          />
        </div>

        <div className="bg-white rounded-2xl shadow p-4">
          <label className="block text-sm font-medium mb-2">メモ</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={5}
            placeholder="施術内容、注意点など"
            className="w-full border rounded-xl px-4 py-3"
          />
        </div>

        <div className="bg-white rounded-2xl shadow p-4">
          <label className="block text-sm font-medium mb-2">次回来店予定</label>
          <input
            type="date"
            value={nextVisitDate}
            onChange={(e) => setNextVisitDate(e.target.value)}
            className="w-full border rounded-xl px-4 py-3"
          />
        </div>

        <div className="bg-white rounded-2xl shadow p-4">
          <label className="block text-sm font-medium mb-2">次回提案</label>
          <textarea
            value={nextProposal}
            onChange={(e) => setNextProposal(e.target.value)}
            rows={4}
            placeholder="例）次回は桜マグネット＋補強メニューを提案"
            className="w-full border rounded-xl px-4 py-3"
          />
          <p className="text-xs text-gray-500 mt-2">
            次回おすすめしたいデザイン・色・メニューを記録します
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-black text-white py-3 font-medium"
        >
          {loading ? "保存中..." : "保存する"}
        </button>
      </form>
    </div>
  );
}