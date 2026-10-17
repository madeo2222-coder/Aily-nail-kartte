"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type DailyResult = {
  date: string;
  sales: number;
  count: number;
  error: boolean;
};

export function getJapanDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isValidSalesDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftSalesDate(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

// Never turn a failed, truncated, or inconsistent read into a day's total.
export function summarizeDailySales(data: unknown, count: number | null, date: string) {
  if (!Array.isArray(data) || !Number.isInteger(count) || count !== data.length) {
    throw new Error("Incomplete daily sales response");
  }

  const ids = new Set<string>();
  let sales = 0;
  for (const row of data) {
    if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id) || row.visit_date !== date) {
      throw new Error("Invalid daily sales row");
    }
    ids.add(row.id);
    const price = row.price === null ? 0 : row.price;
    if ((typeof price !== "number" && typeof price !== "string") || price === "" || !Number.isFinite(Number(price))) {
      throw new Error("Invalid daily sales amount");
    }
    sales += Number(price);
  }
  if (!Number.isFinite(sales)) throw new Error("Invalid daily sales total");
  return { sales, count: data.length };
}

export default function DailySalesSummary() {
  const today = getJapanDateString();
  const [selectedDate, setSelectedDate] = useState(() => getJapanDateString());
  const [result, setResult] = useState<DailyResult | null>(null);
  const [retry, setRetry] = useState(0);
  const validDate = isValidSalesDate(selectedDate) && selectedDate <= today;

  useEffect(() => {
    if (!validDate) return;
    let active = true;

    async function loadDailySales() {
      try {
        const { data, count, error } = await supabase
          .from("visits")
          .select("id, visit_date, price", { count: "exact" })
          .eq("visit_date", selectedDate);
        if (error) throw error;
        const summary = summarizeDailySales(data, count, selectedDate);
        if (active) setResult({ date: selectedDate, ...summary, error: false });
      } catch {
        if (active) setResult({ date: selectedDate, sales: 0, count: 0, error: true });
      }
    }

    void loadDailySales();
    return () => { active = false; };
  }, [selectedDate, validDate, retry]);

  function selectDate(date: string) {
    // Clear before the effect so an old total never appears under a new date.
    setResult(null);
    setSelectedDate(date);
    setRetry((value) => value + 1);
  }

  function changeDate(date: string) {
    if (date !== selectedDate) selectDate(date);
  }

  const currentResult = result?.date === selectedDate ? result : null;
  const buttonClass = "min-h-11 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-600 disabled:opacity-40";

  return (
    <>
      <div className="col-span-2 min-w-0 rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
        <label htmlFor="daily-sales-date" className="text-sm font-bold text-gray-900">
          日別売上の表示日
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex-1">
            <button type="button" aria-label="前日の売上を見る" className={`${buttonClass} w-11`}
              disabled={!validDate || selectedDate === "0001-01-01"}
              onClick={() => selectDate(shiftSalesDate(selectedDate, -1))}><span aria-hidden="true" className="text-xl">‹</span></button>
            <input id="daily-sales-date" type="date" value={selectedDate}
              min="0001-01-01" max={today} aria-describedby="daily-sales-help"
              onChange={(event) => changeDate(event.target.value)}
              onInput={(event) => changeDate(event.currentTarget.value)}
              className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-rose-200 bg-white px-1 py-2 text-base text-gray-900" />
            <button type="button" aria-label="翌日の売上を見る" className={`${buttonClass} w-11`}
              disabled={!validDate || selectedDate >= today}
              onClick={() => selectDate(shiftSalesDate(selectedDate, 1))}><span aria-hidden="true" className="text-xl">›</span></button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => selectDate(shiftSalesDate(getJapanDateString(), -1))}
              className={`${buttonClass} flex-1`}>昨日</button>
            <button type="button" onClick={() => selectDate(getJapanDateString())}
              className={`${buttonClass} flex-1`}>今日</button>
          </div>
        </div>
        <p id="daily-sales-help" className="mt-2 text-xs leading-5 text-gray-500">
          日付を変えると日別売上・来店数が切り替わります。今月の売上と今日の予定は変わりません。
        </p>
      </div>

      <section aria-label="選択日の売上" className="min-w-0 rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
        <div className="text-sm text-gray-500">
          {selectedDate === today ? "今日の売上" : "選択日の売上"}
        </div>
        {validDate ? <div className="mt-1 text-xs text-gray-500">{formatDateLabel(selectedDate)}</div> : null}
        <div aria-live="polite" aria-atomic="true" className="mt-2">
          {!validDate ? (
            <p className="text-sm text-rose-600">今日以前の日付を選択してください。</p>
          ) : !currentResult ? (
            <p role="status" className="text-sm text-gray-500">売上を読み込み中...</p>
          ) : currentResult.error ? (
            <div role="alert" className="text-sm text-red-700">
              <p>この日の売上を取得できませんでした。</p>
              <button type="button" onClick={() => selectDate(selectedDate)} className={`${buttonClass} mt-2`}>
                再試行
              </button>
            </div>
          ) : (
            <>
              <div className="break-words text-2xl font-bold text-gray-900">
                ¥{Math.round(currentResult.sales).toLocaleString("ja-JP")}
              </div>
              <div className="mt-2 text-sm text-gray-500">来店数 {currentResult.count}件</div>
              {currentResult.count === 0 ? <p className="mt-2 text-xs text-gray-500">この日の来店記録はありません。</p> : null}
              <p className="mt-2 text-xs text-gray-400">登録済みの来店金額の合計</p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
