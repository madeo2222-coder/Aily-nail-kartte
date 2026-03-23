"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";

export default function EditVisitPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = String(params.id);

  const [visitDate, setVisitDate] = useState("");
  const [menuName, setMenuName] = useState("");
  const [staffName, setStaffName] = useState("");
  const [price, setPrice] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchVisit();
  }, []);

  async function fetchVisit() {
    const { data, error } = await supabase
      .from("visits")
      .select("*")
      .eq("id", visitId)
      .single();

    if (error) {
      console.error("来店取得エラー:", error);
      alert("来店データの取得に失敗しました");
      return;
    }

    setVisitDate(data?.visit_date ? String(data.visit_date).split("T")[0] : "");
    setMenuName(data?.menu_name || "");
    setStaffName(data?.staff_name || "");
    setPrice(
      data?.price === null || data?.price === undefined ? "" : String(data.price)
    );
    setMemo(data?.memo || "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase
      .from("visits")
      .update({
        visit_date: visitDate || null,
        menu_name: menuName || null,
        staff_name: staffName || null,
        price: price === "" ? null : Number(price),
        memo: memo || null,
      })
      .eq("id", visitId);

    setLoading(false);

    if (error) {
      console.error("来店更新エラー:", error);
      alert("更新に失敗しました");
      return;
    }

    alert("更新しました");
    router.push("/visits");
  }

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">来店編集</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 font-medium">来店日</label>
          <input
            type="date"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            className="w-full border rounded px-3 py-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">メニュー</label>
          <input
            type="text"
            value={menuName}
            onChange={(e) => setMenuName(e.target.value)}
            className="w-full border rounded px-3 py-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">担当</label>
          <input
            type="text"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            className="w-full border rounded px-3 py-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">金額</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full border rounded px-3 py-3"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">メモ</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full border rounded px-3 py-3"
            rows={4}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white rounded px-4 py-4 text-lg font-bold disabled:opacity-50"
        >
          {loading ? "更新中..." : "更新する"}
        </button>
      </form>
    </div>
  );
}