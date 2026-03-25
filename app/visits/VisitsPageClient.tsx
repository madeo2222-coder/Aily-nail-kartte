"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRelation =
  | {
      name: string | null;
    }
  | {
      name: string | null;
    }[]
  | null;

type Visit = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  price: number | null;
  memo: string | null;
  next_visit_date: string | null;
  next_proposal: string | null;
  next_suggestion: string | null;
  customers: CustomerRelation;
};

function getCustomerName(customers: CustomerRelation) {
  if (!customers) return "顧客名なし";
  if (Array.isArray(customers)) {
    return customers[0]?.name || "顧客名なし";
  }
  return customers.name || "顧客名なし";
}

function formatDate(value: string | null) {
  if (!value) return "未設定";
  return value;
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined) return "¥0";
  return `¥${value.toLocaleString()}`;
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
      .order("visit_date", { ascending: false });

    if (error) {
      console.error("来店履歴の取得エラー:", error);
      setVisits([]);
      setLoading(false);
      return;
    }

    setVisits((data as Visit[]) || []);
    setLoading(false);
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">来店一覧</h1>
        <Link
          href="/visits/new"
          className="rounded-lg bg-black px-4 py-2 text-sm text-white"
        >
          来店履歴を追加
        </Link>
      </div>

      {visits.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">
          来店履歴がありません
        </div>
      ) : (
        <div className="space-y-3">
          {visits.map((visit) => {
            const customerName = getCustomerName(visit.customers);
            const proposal =
              visit.next_proposal || visit.next_suggestion || "未設定";

            return (
              <div
                key={visit.id}
                className="rounded-2xl border bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-lg font-semibold">{customerName}</div>
                    <div className="text-sm text-gray-500">
                      来店日: {formatDate(visit.visit_date)}
                    </div>
                  </div>

                  <Link
                    href={`/visits/${visit.id}/edit`}
                    className="shrink-0 rounded-lg border px-3 py-2 text-sm"
                  >
                    編集
                  </Link>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                  <div>
                    <span className="font-medium">売上:</span>{" "}
                    {formatPrice(visit.price)}
                  </div>

                  <div>
                    <span className="font-medium">次回来店予定:</span>{" "}
                    {formatDate(visit.next_visit_date)}
                  </div>

                  <div>
                    <span className="font-medium">次回提案:</span> {proposal}
                  </div>

                  <div>
                    <span className="font-medium">メモ:</span>{" "}
                    {visit.memo?.trim() ? visit.memo : "なし"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}