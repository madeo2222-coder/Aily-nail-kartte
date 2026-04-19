"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";

export default function CustomerEditPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [name, setName] = useState("");
  const [nameKana, setNameKana] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    fetchCustomer();
  }, [customerId]);

  async function fetchCustomer() {
    setFetching(true);

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, name_kana, phone")
      .eq("id", customerId)
      .single();

    if (error) {
      console.error("顧客取得エラー:", error);
      alert("顧客情報の取得に失敗しました");
      setFetching(false);
      return;
    }

    setName(data?.name || "");
    setNameKana(data?.name_kana || "");
    setPhone(data?.phone || "");
    setFetching(false);
  }

  function normalizePhone(value: string) {
    const raw = value.replace(/[^\d+]/g, "");

    if (raw.startsWith("+81")) {
      return raw;
    }

    if (raw.startsWith("0")) {
      return "+81" + raw.slice(1);
    }

    return raw;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      alert("名前を入力してください");
      return;
    }

    setLoading(true);

    const normalizedPhone = phone ? normalizePhone(phone) : null;

    const { error } = await supabase
      .from("customers")
      .update({
        name: name.trim(),
        name_kana: nameKana.trim() || null,
        phone: normalizedPhone,
      })
      .eq("id", customerId);

    setLoading(false);

    if (error) {
      console.error("顧客更新エラー:", error);
      alert("顧客情報の更新に失敗しました");
      return;
    }

    alert("顧客情報を更新しました");
    router.push(`/customers/${customerId}`);
  }

  if (fetching) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-4 pb-24">
      <h1 className="mb-6 text-2xl font-bold">顧客情報を編集</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow">
          <label className="mb-2 block text-sm font-medium">名前</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border px-4 py-3"
            placeholder="顧客名"
          />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          <label className="mb-2 block text-sm font-medium">フリガナ</label>
          <input
            type="text"
            value={nameKana}
            onChange={(e) => setNameKana(e.target.value)}
            className="w-full rounded-xl border px-4 py-3"
            placeholder="ヤマダ ハナコ"
          />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          <label className="mb-2 block text-sm font-medium">電話番号</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border px-4 py-3"
            placeholder="09012345678 または +819012345678"
          />
          <p className="mt-2 text-xs text-gray-500">
            保存時に 090 形式は自動で +81 形式へ変換します
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-black py-3 font-medium text-white"
        >
          {loading ? "更新中..." : "更新する"}
        </button>

        <button
          type="button"
          onClick={() => router.push(`/customers/${customerId}`)}
          className="w-full rounded-xl border border-gray-300 bg-white py-3 font-medium"
        >
          戻る
        </button>
      </form>
    </div>
  );
}