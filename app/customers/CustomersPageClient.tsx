"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Customer = {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  ltv: number;
  lastVisitDate?: string;
  nextVisitDate?: string;
};

export default function CustomersPageClient() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => setCustomers(data));
  }, []);

  const filtered = customers; // 後でロジック追加OK

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">顧客一覧</h1>

      {/* フィルター */}
      <div className="flex gap-2 mb-4">
        {["all", "next", "follow", "lost"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full border ${
              filter === f ? "bg-black text-white" : "bg-white"
            }`}
          >
            {f === "all" && "すべて"}
            {f === "next" && "次回来店予定"}
            {f === "follow" && "フォロー必要"}
            {f === "lost" && "失客"}
          </button>
        ))}
      </div>

      {/* 一覧 */}
      <div className="space-y-4">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="border rounded-xl p-4 bg-white shadow-sm"
          >
            <div className="font-bold text-lg">{c.name}</div>

            <div className="text-sm mt-2">電話番号：{c.phone}</div>
            <div className="text-sm">来店回数：{c.visitCount}回</div>
            <div className="text-sm">LTV：¥{c.ltv.toLocaleString()}</div>
            <div className="text-sm">
              最終来店日：{c.lastVisitDate ?? "-"}
            </div>
            <div className="text-sm">
              次回来店日：{c.nextVisitDate ?? "-"}
            </div>

            <div className="flex gap-2 mt-3">
              <Link
                href={`/customers/${c.id}`}
                className="px-3 py-1 border rounded"
              >
                詳細を見る
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}