"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Visit = {
  id: string;
  customer_id?: string | null;
  visit_date?: string | null;
  menu_name?: string | null;
  staff_name?: string | null;
  price?: number | string | null;
  memo?: string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

export default function VisitsPageClient() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVisits();
  }, []);

  async function fetchVisits() {
    setLoading(true);

    const { data, error } = await supabase
      .from("visits")
      .select("*")
      .order("visit_date", { ascending: false });

    if (error) {
      console.error("visits fetch error:", error);
      setVisits([]);
      setLoading(false);
      return;
    }

    setVisits(data || []);
    setLoading(false);
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">来店一覧</h1>

        <Link
          href="/visits/new"
          className="rounded-xl bg-black px-4 py-3 text-sm font-bold text-white"
        >
          ＋ 来店登録
        </Link>
      </div>

      {visits.length === 0 ? (
        <div className="rounded-2xl border bg-white p-5">
          <p>来店データがまだありません。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visits.map((visit) => (
            <div key={visit.id} className="rounded-2xl border bg-white p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm text-gray-500">来店日</p>
                  <p className="text-xl font-bold">
                    {visit.visit_date || "-"}
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-500">売上</p>
                  <p className="text-xl font-bold">
                    {formatYen(toNumber(visit.price))}
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-500">メニュー</p>
                  <p className="text-lg font-semibold">
                    {visit.menu_name || "-"}
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-500">担当者</p>
                  <p className="text-lg font-semibold">
                    {visit.staff_name || "-"}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-1 text-sm text-gray-500">メモ</p>
                <p className="whitespace-pre-wrap text-base text-gray-800">
                  {visit.memo || "-"}
                </p>
              </div>

              <div className="mt-5 flex gap-3">
                <Link
                  href={`/visits/${visit.id}/edit`}
                  className="rounded-xl border px-4 py-3 text-sm font-bold"
                >
                  編集
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}