"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
};

type Visit = {
  customer_id: string;
  visit_date: string | null;
  next_visit_date: string | null;
  price?: number | null;
};

type Reminder = {
  customer_id: string;
  name: string;
  next_visit_date: string;
  price: number;
};

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const requestVersion = useRef(0);

  const fetchReminders = useCallback(async () => {
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current;

    try {
      setLoading(true);
      setErrorMessage("");

      const [customerRes, visitRes] = await Promise.all([
        supabase.from("customers").select("id, name"),
        supabase
          .from("visits")
          .select("customer_id, visit_date, next_visit_date, price")
          .not("next_visit_date", "is", null)
          .order("visit_date", { ascending: false }),
      ]);

      if (!isCurrent()) return;

      if (customerRes.error) {
        console.error("customers fetch error:", customerRes.error.message);
        setErrorMessage(`顧客データの取得に失敗しました: ${customerRes.error.message}`);
        setReminders([]);
        return;
      }

      if (visitRes.error) {
        console.error("visits fetch error:", visitRes.error.message);
        setErrorMessage(`来店データの取得に失敗しました: ${visitRes.error.message}`);
        setReminders([]);
        return;
      }

      const customers = (customerRes.data || []) as Customer[];
      const visits = (visitRes.data || []) as Visit[];

      const customerMap = new Map<string, string>();
      for (const customer of customers) {
        customerMap.set(customer.id, customer.name || "顧客名なし");
      }

      const latestVisitMap = new Map<string, Visit>();
      for (const visit of visits) {
        if (!visit.customer_id) continue;
        if (!latestVisitMap.has(visit.customer_id)) {
          latestVisitMap.set(visit.customer_id, visit);
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(today.getDate() + 7);
      sevenDaysLater.setHours(23, 59, 59, 999);

      const list: Reminder[] = [];

      for (const [customerId, visit] of latestVisitMap.entries()) {
        if (!visit.next_visit_date) continue;

        const nextDate = new Date(visit.next_visit_date);
        if (Number.isNaN(nextDate.getTime())) continue;

        if (nextDate >= today && nextDate <= sevenDaysLater) {
          list.push({
            customer_id: customerId,
            name: customerMap.get(customerId) || "顧客名なし",
            next_visit_date: visit.next_visit_date,
            price: Number(visit.price || 0),
          });
        }
      }

      list.sort((a, b) => {
        return (
          new Date(a.next_visit_date).getTime() -
          new Date(b.next_visit_date).getTime()
        );
      });

      setReminders(list);
    } catch (error) {
      if (!isCurrent()) return;
      console.error("reminders unexpected error:", error);
      setErrorMessage(
        "リマインドデータを取得できませんでした。通信状態を確認して再試行してください。"
      );
      setReminders([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void fetchReminders();
    });
    return () => {
      active = false;
      requestVersion.current += 1;
    };
  }, [fetchReminders]);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("ja-JP");
  }

  function getLabel(dateStr: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);

    const diffDays =
      (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 0) return "今日";
    if (diffDays === 1) return "明日";
    return `${diffDays}日後`;
  }

  const todayCount = reminders.filter((r) => getLabel(r.next_visit_date) === "今日").length;
  const todaySales = reminders
    .filter((r) => getLabel(r.next_visit_date) === "今日")
    .reduce((sum, r) => sum + Number(r.price || 0), 0);

  const weekCount = reminders.length;
  const weekSales = reminders.reduce((sum, r) => sum + Number(r.price || 0), 0);

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  if (errorMessage) {
    return (
      <div className="p-4 pb-24">
        <h1 className="mb-4 text-xl font-bold">🔔 リマインド</h1>
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm"
          role="alert"
        >
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => void fetchReminders()}
            className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 font-bold text-red-900"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold">🔔 リマインド</h1>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">今日の予定人数</div>
          <div className="mt-1 text-2xl font-bold">{todayCount}人</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">今日の予定売上</div>
          <div className="mt-1 text-2xl font-bold">
            ¥{todaySales.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">7日以内の予定人数</div>
          <div className="mt-1 text-2xl font-bold">{weekCount}人</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">7日以内の予定売上</div>
          <div className="mt-1 text-2xl font-bold">
            ¥{weekSales.toLocaleString()}
          </div>
        </div>
      </div>

      {reminders.length === 0 ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-500 shadow-sm">
          7日以内の来店予定はありません
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.map((r) => (
            <div
              key={`${r.customer_id}-${r.next_visit_date}`}
              className="rounded-2xl border bg-white p-4 shadow-sm"
            >
              <div className="text-lg font-bold">{r.name}</div>
              <div className="mt-1 text-sm text-blue-600">
                {formatDate(r.next_visit_date)}（{getLabel(r.next_visit_date)}）
              </div>
              <div className="mt-1 text-sm text-gray-600">
                予定売上：¥{Number(r.price || 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
