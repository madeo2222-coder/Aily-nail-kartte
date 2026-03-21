"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function NewVisitPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const [visitDate, setVisitDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [menuName, setMenuName] = useState("");
  const [price, setPrice] = useState("");
  const [memo, setMemo] = useState("");

  const [loading, setLoading] = useState(false);

  // 初期処理
  useEffect(() => {
    fetchCustomers();
    fetchLatestIntake();
  }, []);

  // 顧客一覧取得
  async function fetchCustomers() {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    setCustomers(data || []);
  }

  // 🔥 ここが今回の追加（最新の初回入力から自動選択）
  async function fetchLatestIntake() {
    const { data } = await supabase
      .from("customer_intakes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.customer_id) {
      setSelectedCustomerId(String(data.customer_id));
    }
  }

  // 登録処理
  async function handleSubmit() {
    if (!selectedCustomerId) {
      alert("顧客を選択してください");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("visits").insert({
      customer_id: Number(selectedCustomerId),
      visit_date: visitDate,
      menu_name: menuName,
      price: Number(price),
      memo: memo,
    });

    setLoading(false);

    if (error) {
      alert("登録失敗");
      return;
    }

    alert("登録完了");
    router.push("/visits");
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">来店登録</h1>

      {/* 顧客選択 */}
      <div>
        <label className="block mb-1">顧客</label>
        <select
          value={selectedCustomerId}
          onChange={(e) => setSelectedCustomerId(e.target.value)}
          className="w-full border p-2 rounded"
        >
          <option value="">選択してください</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}（{c.phone}）
            </option>
          ))}
        </select>
      </div>

      {/* 来店日 */}
      <div>
        <label className="block mb-1">来店日</label>
        <input
          type="date"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
          className="w-full border p-2 rounded"
        />
      </div>

      {/* メニュー */}
      <div>
        <label className="block mb-1">メニュー名</label>
        <input
          value={menuName}
          onChange={(e) => setMenuName(e.target.value)}
          className="w-full border p-2 rounded"
        />
      </div>

      {/* 金額 */}
      <div>
        <label className="block mb-1">金額</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full border p-2 rounded"
        />
      </div>

      {/* メモ */}
      <div>
        <label className="block mb-1">メモ</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="w-full border p-2 rounded"
        />
      </div>

      {/* ボタン */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-black text-white py-3 rounded"
      >
        {loading ? "登録中..." : "登録する"}
      </button>
    </div>
  );
}