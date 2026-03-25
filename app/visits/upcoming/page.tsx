"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type VisitRow = {
  id: string;
  customer_id: string;
  visit_date?: string | null;
  next_visit_date?: string | null;
  next_suggestion?: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  phone?: string | null;
};

type UpcomingVisit = {
  id: string;
  customer_id: string;
  customer_name: string;
  phone?: string | null;
  last_visit_date?: string | null;
  next_visit_date: string;
  next_suggestion?: string | null;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateOnlyString(date: Date) {
  return date.toISOString().split("T")[0];
}

export default function UpcomingVisitsPage() {
  const [items, setItems] = useState<UpcomingVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"today" | "week" | "all">("week");

  useEffect(() => {
    fetchUpcomingVisits();
  }, []);

  async function fetchUpcomingVisits() {
    try {
      setLoading(true);
      setMessage("");

      const { data: visitsData, error: visitsError } = await supabase
        .from("visits")
        .select("id, customer_id, visit_date, next_visit_date, next_suggestion")
        .not("next_visit_date", "is", null)
        .order("next_visit_date", { ascending: true });

      if (visitsError) {
        console.error("visits取得エラー:", visitsError);
        setMessage(`来店予定の取得に失敗しました: ${visitsError.message}`);
        setItems([]);
        return;
      }

      const safeVisits: VisitRow[] = (visitsData || []).map((v: any) => ({
        id: v.id,
        customer_id: v.customer_id,
        visit_date: v.visit_date ?? null,
        next_visit_date: v.next_visit_date ?? null,
        next_suggestion: v.next_suggestion ?? null,
      }));

      const customerIds = Array.from(
        new Set(safeVisits.map((v) => v.customer_id).filter(Boolean))
      );

      let customerMap = new Map<string, CustomerRow>();

      if (customerIds.length > 0) {
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, name, phone")
          .in("id", customerIds);

        if (customersError) {
          console.error("customers取得エラー:", customersError);
          setMessage(`顧客情報の取得に失敗しました: ${customersError.message}`);
        } else {
          customerMap = new Map(
            ((customersData || []) as CustomerRow[]).map((c) => [c.id, c])
          );
        }
      }

      const merged: UpcomingVisit[] = safeVisits
        .filter((v) => v.next_visit_date)
        .map((v) => {
          const customer = customerMap.get(v.customer_id);

          return {
            id: v.id,
            customer_id: v.customer_id,
            customer_name: customer?.name || "不明",
            phone: customer?.phone || null,
            last_visit_date: v.visit_date || null,
            next_visit_date: v.next_visit_date as string,
            next_suggestion: v.next_suggestion || null,
          };
        });

      setItems(merged);
    } catch (err) {
      console.error("予期しないエラー:", err);
      setMessage("予期しないエラーが発生しました");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    const today = startOfToday();
    const todayStr = toDateOnlyString(today);
    const weekEndStr = toDateOnlyString(addDays(today, 7));

    if (filter === "today") {
      return items.filter((item) => item.next_visit_date === todayStr);
    }

    if (filter === "week") {
      return items.filter(
        (item) =>
          item.next_visit_date >= todayStr && item.next_visit_date <= weekEndStr
      );
    }

    return items;
  }, [items, filter]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">次回来店予定リスト</h1>
          <Link
            href="/customers"
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            顧客一覧へ
          </Link>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setFilter("today")}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              filter === "today"
                ? "bg-black text-white"
                : "border border-gray-300 bg-white text-gray-700"
            }`}
          >
            今日
          </button>

          <button
            type="button"
            onClick={() => setFilter("week")}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              filter === "week"
                ? "bg-black text-white"
                : "border border-gray-300 bg-white text-gray-700"
            }`}
          >
            今週
          </button>

          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              filter === "all"
                ? "bg-black text-white"
                : "border border-gray-300 bg-white text-gray-700"
            }`}
          >
            全件
          </button>
        </div>

        {message && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">読み込み中...</div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm text-gray-500">
            対象の次回来店予定はありません
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <Link
                key={item.id}
                href={`/customers/${item.customer_id}`}
                className="block rounded-2xl bg-white p-5 shadow-sm"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div>
                    <p className="text-sm text-gray-500">顧客名</p>
                    <p className="text-xl font-bold text-gray-900">
                      {item.customer_name}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">次回来店予定</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {item.next_visit_date}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">最終来店日</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {item.last_visit_date || "-"}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">電話番号</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {item.phone || "-"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-amber-50 p-3">
                  <p className="mb-1 text-sm font-semibold text-amber-800">
                    次回提案
                  </p>
                  <p className="text-sm text-gray-800">
                    {item.next_suggestion || "未設定"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}