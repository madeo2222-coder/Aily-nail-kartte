"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NewVisitPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [intakes, setIntakes] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [matchedIntake, setMatchedIntake] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: customersData } = await supabase
      .from("customers")
      .select("*");

    const { data: intakeData } = await supabase
      .from("customer_intakes")
      .select("*");

    setCustomers(customersData || []);
    setIntakes(intakeData || []);
  }

  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);

    const customer = customers.find((c) => c.id === customerId);

    if (!customer) return;

    const intake = intakes.find(
      (i) => i.phone && customer.phone && i.phone === customer.phone
    );

    setMatchedIntake(intake || null);
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">来店登録</h1>

      {/* 顧客選択 */}
      <select
        className="border p-2 w-full mb-4"
        onChange={(e) => handleCustomerChange(e.target.value)}
      >
        <option value="">顧客を選択</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}（{c.phone}）
          </option>
        ))}
      </select>

      {/* 初回情報表示 */}
      {matchedIntake && (
        <div className="bg-yellow-50 p-4 rounded mb-4 border">
          <h2 className="font-bold mb-2">初回情報</h2>

          <p>
            <strong>アレルギー：</strong>
            {matchedIntake.allergy || "なし"}
          </p>

          <p>
            <strong>NG項目：</strong>
            {matchedIntake.ng_items || "なし"}
          </p>

          <p>
            <strong>同意：</strong>
            {matchedIntake.agreed ? "済み" : "未"}
          </p>

          {matchedIntake.signature_data_url && (
            <img
              src={matchedIntake.signature_data_url}
              alt="署名"
              className="mt-2 border"
            />
          )}
        </div>
      )}

      {!matchedIntake && selectedCustomerId && (
        <div className="bg-red-50 p-3 rounded">
          初回情報が見つかりません
        </div>
      )}

      {/* ここに既存の来店登録フォームをそのまま残す */}
    </div>
  );
}