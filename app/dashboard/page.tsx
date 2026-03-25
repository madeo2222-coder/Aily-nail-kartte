"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type CustomerRelation =
  | {
      name: string;
      phone?: string | null;
    }
  | {
      name: string;
      phone?: string | null;
    }[]
  | null;

type ReminderItem = {
  id: string;
  price: number | null;
  visit_date: string | null;
  next_visit_date: string | null;
  next_proposal: string | null;
  next_suggestion: string | null;
  customers: CustomerRelation;
};

export default function DashboardPage() {
  const [totalSales, setTotalSales] = useState(0);
  const [futureSales, setFutureSales] = useState(0);
  const [futureCount, setFutureCount] = useState(0);
  const [monthlySales, setMonthlySales] = useState(0);

  const [confirmedSales, setConfirmedSales] = useState(0);
  const [followCount, setFollowCount] = useState(0);
  const [lostCount, setLostCount] = useState(0);

  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const { data: visits, error } = await supabase
      .from("visits")
      .select(
        `
        id,
        price,
        visit_date,
        next_visit_date,
        next_proposal,
        next_suggestion,
        customers (
          name,
          phone
        )
      `
      );

    if (error) {
      console.error("取得エラー:", error);
      alert("ダッシュボードデータの取得に失敗しました");
      return;
    }

    const visitList = (visits || []) as ReminderItem[];

    const total = visitList.reduce((sum, v) => sum + (v.price || 0), 0);

    const futureList = visitList.filter(
      (v) => v.next_visit_date && v.next_visit_date >= todayStr
    );

    const future = futureList.reduce((sum, v) => sum + (v.price || 0), 0);
    const futureCnt = futureList.length;

    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const monthly = visitList
      .filter((v) => {
        if (!v.visit_date) return false;
        const d = new Date(v.visit_date);
        return d.getMonth() === month && d.getFullYear() === year;
      })
      .reduce((sum, v) => sum + (v.price || 0), 0);

    const confirmed = futureList.reduce((sum, v) => sum + (v.price || 0), 0);

    const customerMap = new Map<string, ReminderItem[]>();

    visitList.forEach((v) => {
      const key = getCustomerName(v);
      if (!customerMap.has(key)) {
        customerMap.set(key, []);
      }
      customerMap.get(key)!.push(v);
    });

    let follow = 0;
    let lost = 0;

    customerMap.forEach((visits) => {
      const sorted = [...visits].sort((a, b) =>
        (b.visit_date || "").localeCompare(a.visit_date || "")
      );

      const last = sorted[0]?.visit_date || null;
      const hasFuture = visits.some(
        (v) => v.next_visit_date && v.next_visit_date >= todayStr
      );

      if (!last) return;

      const diff =
        (today.getTime() - new Date(last).getTime()) /
        (1000 * 60 * 60 * 24);

      if (!hasFuture && diff >= 30) {
        lost += 1;
      } else if (!hasFuture && diff >= 0 && diff < 30) {
        follow += 1;
      }
    });

    const reminderList = visitList.filter((v) => {
      if (!v.next_visit_date) return false;

      const visitDate = new Date(v.next_visit_date);
      const diff =
        (visitDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

      return diff >= 0 && diff <= 3;
    });

    setTotalSales(total);
    setFutureSales(future);
    setFutureCount(futureCnt);
    setMonthlySales(monthly);
    setConfirmedSales(confirmed);
    setFollowCount(follow);
    setLostCount(lost);
    setReminders(reminderList);
  }

  function getCustomerName(item: ReminderItem) {
    if (!item.customers) return "顧客名不明";
    if (Array.isArray(item.customers)) {
      return item.customers[0]?.name || "顧客名不明";
    }
    return item.customers.name || "顧客名不明";
  }

  function getCustomerPhone(item: ReminderItem) {
    if (!item.customers) return null;
    if (Array.isArray(item.customers)) {
      return item.customers[0]?.phone || null;
    }
    return item.customers.phone || null;
  }

  async function handleSendSms(item: ReminderItem) {
    const phone = getCustomerPhone(item);

    if (!phone) {
      alert("顧客の電話番号が登録されていません");
      return;
    }

    if (!phone.startsWith("+81")) {
      alert(
        "電話番号がSMS送信形式ではありません。顧客情報を編集して +81 形式にしてください。"
      );
      return;
    }

    setSendingId(item.id);

    try {
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phone,
          customerName: getCustomerName(item),
          nextVisitDate: item.next_visit_date,
          proposal: item.next_proposal || item.next_suggestion || "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "SMS送信に失敗しました");
        setSendingId(null);
        return;
      }

      alert("SMSを送信しました");
    } catch (error) {
      console.error("SMS送信エラー:", error);
      alert("SMS送信中にエラーが発生しました");
    }

    setSendingId(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-24">
      <h1 className="text-3xl font-bold">ダッシュボード</h1>

      <MetricCard title="総売上" value={`¥${totalSales.toLocaleString()}`} />
      <MetricCard title="今月売上" value={`¥${monthlySales.toLocaleString()}`} />

      <MetricCard
        title="未来売上（予定）"
        value={`¥${futureSales.toLocaleString()}`}
        tone="green"
      />

      <Link href="/customers?filter=upcoming" className="block">
        <MetricCard
          title="次回来店予定数"
          value={`${futureCount}件`}
          tone="yellow"
          clickable
        />
      </Link>

      <MetricCard
        title="確定売上"
        value={`¥${confirmedSales.toLocaleString()}`}
        tone="green"
      />

      <Link href="/customers?filter=follow" className="block">
        <MetricCard
          title="フォロー必要"
          value={`${followCount}人`}
          tone="yellow"
          clickable
        />
      </Link>

      <Link href="/customers?filter=lost" className="block">
        <MetricCard
          title="失客"
          value={`${lostCount}人`}
          tone="red"
          clickable
        />
      </Link>

      <div className="rounded-3xl bg-red-50 p-6 shadow">
        <p className="mb-4 text-xl text-red-700">リマインド対象（3日以内）</p>

        {reminders.length === 0 ? (
          <p className="text-gray-500">対象なし</p>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => (
              <div key={r.id} className="rounded-xl border bg-white p-4">
                <p className="text-lg font-bold">{getCustomerName(r)}</p>
                <p className="text-sm text-gray-600">
                  電話番号：{getCustomerPhone(r) || "未登録"}
                </p>
                <p className="text-sm text-gray-600">
                  来店予定日：{r.next_visit_date || "未設定"}
                </p>
                <p className="mb-3 text-sm text-gray-600">
                  提案：{r.next_proposal || r.next_suggestion || "なし"}
                </p>

                <button
                  type="button"
                  onClick={() => handleSendSms(r)}
                  disabled={sendingId === r.id}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {sendingId === r.id ? "送信中..." : "SMS送信"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  tone = "white",
  clickable = false,
}: {
  title: string;
  value: string;
  tone?: "white" | "green" | "yellow" | "red";
  clickable?: boolean;
}) {
  const toneClass =
    tone === "green"
      ? "bg-green-50"
      : tone === "yellow"
      ? "bg-yellow-50"
      : tone === "red"
      ? "bg-red-50"
      : "bg-white";

  const textClass =
    tone === "green"
      ? "text-green-700"
      : tone === "yellow"
      ? "text-amber-700"
      : tone === "red"
      ? "text-red-700"
      : "text-gray-500";

  return (
    <div
      className={`${toneClass} rounded-3xl p-6 shadow ${
        clickable ? "transition hover:opacity-90" : ""
      }`}
    >
      <p className={`mb-2 text-xl ${textClass}`}>
        {title}
        {clickable ? " →" : ""}
      </p>
      <p className="text-4xl font-bold">{value}</p>
    </div>
  );
}