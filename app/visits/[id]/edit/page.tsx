"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  price: number | null;
  memo: string | null;
  next_visit_date: string | null;
  next_proposal: string | null;
  next_suggestion: string | null;
  customers:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

function getCustomerName(
  customers:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null
) {
  if (!customers) return "顧客名なし";
  if (Array.isArray(customers)) {
    return customers[0]?.name || "顧客名なし";
  }
  return customers.name || "顧客名なし";
}

export default function EditVisitPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [price, setPrice] = useState("");
  const [memo, setMemo] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextProposal, setNextProposal] = useState("");

  useEffect(() => {
    if (!visitId) return;
    fetchVisit();
  }, [visitId]);

  async function fetchVisit() {
    setLoading(true);

    const { data, error } = await supabase
      .from("visits")
      .select(
        `
        id,
        customer_id,
        visit_date,
        price,
        memo,
        next_visit_date,
        next_proposal,
        next_suggestion,
        customers (
          name
        )
      `
      )
      .eq("id", visitId)
      .single();

    if (error) {
      console.error("来店履歴の取得エラー:", error);
      alert("来店履歴の取得に失敗しました");
      setLoading(false);
      return;
    }

    const visit = data as VisitRow;

    setCustomerName(getCustomerName(visit.customers));
    setVisitDate(visit.visit_date || "");
    setPrice(
      visit.price === null || visit.price === undefined ? "" : String(visit.price)
    );
    setMemo(visit.memo || "");
    setNextVisitDate(visit.next_visit_date || "");
    setNextProposal(visit.next_proposal || visit.next_suggestion || "");

    setLoading(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();

    if (!visitDate) {
      alert("来店日を入力してください");
      return;
    }

    setSaving(true);

    const parsedPrice =
      price.trim() === "" ? null : Number(price.replaceAll(",", ""));

    if (parsedPrice !== null && Number.isNaN(parsedPrice)) {
      alert("売上は数字で入力してください");
      setSaving(false);
      return;
    }

    const updateData = {
      visit_date: visitDate || null,
      price: parsedPrice,
      memo: memo.trim() || null,
      next_visit_date: nextVisitDate || null,
      next_proposal: nextProposal.trim() || null,
      next_suggestion: nextProposal.trim() || null,
    };

    const { error } = await supabase
      .from("visits")
      .update(updateData)
      .eq("id", visitId);

    if (error) {
      console.error("来店履歴の更新エラー:", error);
      alert("更新に失敗しました");
      setSaving(false);
      return;
    }

    alert("来店履歴を更新しました");
    router.push("/visits");
    router.refresh();
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">来店履歴を編集</h1>
          <Link href="/visits" className="text-sm text-blue-600 underline">
            来店一覧へ戻る
          </Link>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-4 text-sm text-gray-500">顧客名: {customerName}</div>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">来店日</label>
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">売上</label>
              <input
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="例: 8800"
                className="w-full rounded-xl border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">メモ</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={4}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="施術内容や注意点など"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                次回来店予定
              </label>
              <input
                type="date"
                value={nextVisitDate}
                onChange={(e) => setNextVisitDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">次回提案</label>
              <textarea
                value={nextProposal}
                onChange={(e) => setNextProposal(e.target.value)}
                rows={3}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="次回おすすめデザイン、提案メニューなど"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            >
              {saving ? "更新中..." : "更新する"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}