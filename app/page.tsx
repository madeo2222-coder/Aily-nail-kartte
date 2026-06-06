"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
};

type Visit = {
  id: string;
  customer_id: string | null;
  visit_date?: string | null;
  price?: number | null;
};

type Reservation = {
  id: string;
  customer_id?: string | null;
  status?: string | null;
  start_at?: string | null;
  reservation_date?: string | null;
  date?: string | null;
  visit_date?: string | null;
  reserved_at?: string | null;
};

function toDateOnlyString(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthStartText(date: Date) {
  return toDateOnlyString(new Date(date.getFullYear(), date.getMonth(), 1));
}

function getNextMonthStartText(date: Date) {
  return toDateOnlyString(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

function getNextMonthEndText(date: Date) {
  return toDateOnlyString(new Date(date.getFullYear(), date.getMonth() + 2, 0));
}

function getPreviousMonthStartText(date: Date) {
  return toDateOnlyString(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

function getPreviousMonthSameDayText(date: Date) {
  const currentDay = date.getDate();
  const previousMonthLastDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    0
  ).getDate();

  const targetDay = Math.min(currentDay, previousMonthLastDay);

  return toDateOnlyString(
    new Date(date.getFullYear(), date.getMonth() - 1, targetDay)
  );
}

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatDiffYen(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${prefix}${formatYen(Math.abs(value))}`;
}

function formatDiffCount(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${prefix}${Math.abs(value).toLocaleString("ja-JP")}件`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "±0.0%";
  const prefix = value > 0 ? "+" : value < 0 ? "" : "±";
  return `${prefix}${value.toFixed(1)}%`;
}

function formatPlainPercent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function isDateInRange(
  dateText: string | null | undefined,
  start: string,
  end: string
) {
  if (!dateText) return false;
  const normalized = dateText.slice(0, 10);
  return normalized >= start && normalized <= end;
}

function normalizeSupabaseDateTime(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const isoLike = trimmed.includes("T")
    ? trimmed
    : trimmed.replace(" ", "T");

  return `${isoLike}Z`;
}

function isDateTimeText(value: string | null | undefined) {
  if (!value) return false;
  return (
    value.includes("T") ||
    value.includes(" ") ||
    /[zZ]$/.test(value) ||
    /[+-]\d{2}:\d{2}$/.test(value)
  );
}

function getJstDateOnly(value: string | null | undefined) {
  const normalizedValue = normalizeSupabaseDateTime(value);

  if (!normalizedValue) return null;

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  const year = map.get("year") || "";
  const month = map.get("month") || "";
  const day = map.get("day") || "";

  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
}

function normalizeDateText(value: string | null | undefined) {
  if (!value) return null;

  if (isDateTimeText(value)) {
    return getJstDateOnly(value);
  }

  return value.slice(0, 10);
}

function getReservationDate(reservation: Reservation) {
  return normalizeDateText(
    reservation.start_at ||
      reservation.reservation_date ||
      reservation.date ||
      reservation.visit_date ||
      reservation.reserved_at ||
      null
  );
}

function isCancelledReservation(status: string | null | undefined) {
  return status === "キャンセル" || status === "cancelled";
}

function isActiveReservation(reservation: Reservation) {
  return !isCancelledReservation(reservation.status);
}

export default function HomePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const [customersRes, visitsRes, reservationsRes] = await Promise.all([
      supabase.from("customers").select("id"),
      supabase.from("visits").select("id, customer_id, visit_date, price"),
      supabase
        .from("reservations")
        .select(
          "id, customer_id, status, start_at, reservation_date, date, visit_date, reserved_at"
        ),
    ]);

    if (customersRes.error) {
      console.error("customers fetch error:", customersRes.error.message);
      setCustomers([]);
    } else {
      setCustomers(customersRes.data || []);
    }

    if (visitsRes.error) {
      console.error("visits fetch error:", visitsRes.error.message);
      setVisits([]);
    } else {
      setVisits((visitsRes.data as Visit[]) || []);
    }

    if (reservationsRes.error) {
      console.error("reservations fetch error:", reservationsRes.error.message);
      setReservations([]);
    } else {
      setReservations((reservationsRes.data as Reservation[]) || []);
    }

    setLoading(false);
  }

  const today = toDateOnlyString(new Date());

  const activeReservations = useMemo(() => {
    return reservations.filter((reservation) => isActiveReservation(reservation));
  }, [reservations]);

  const todaySales = visits.reduce((sum, visit) => {
    if (visit.visit_date === today) {
      return sum + (visit.price || 0);
    }

    return sum;
  }, 0);

  const todayVisitCount = visits.filter(
    (visit) => visit.visit_date === today
  ).length;

  const todayReservationCount = activeReservations.filter((reservation) => {
    return getReservationDate(reservation) === today;
  }).length;

  const monthlyStats = useMemo(() => {
    const now = new Date();

    const currentMonthStart = getMonthStartText(now);
    const currentSameDayEnd = toDateOnlyString(now);

    const previousMonthStart = getPreviousMonthStartText(now);
    const previousMonthSameDayEnd = getPreviousMonthSameDayText(now);

    const nextMonthStart = getNextMonthStartText(now);
    const nextMonthEnd = getNextMonthEndText(now);

    const currentMonthToDateVisits = visits.filter((visit) =>
      isDateInRange(visit.visit_date, currentMonthStart, currentSameDayEnd)
    );

    const previousMonthSameDayVisits = visits.filter((visit) =>
      isDateInRange(visit.visit_date, previousMonthStart, previousMonthSameDayEnd)
    );

    const monthlySales = currentMonthToDateVisits.reduce((sum, visit) => {
      return sum + (visit.price || 0);
    }, 0);

    const previousSameDaySales = previousMonthSameDayVisits.reduce(
      (sum, visit) => {
        return sum + (visit.price || 0);
      },
      0
    );

    const salesDiff = monthlySales - previousSameDaySales;

    const salesDiffRate =
      previousSameDaySales > 0
        ? (salesDiff / previousSameDaySales) * 100
        : monthlySales > 0
        ? 100
        : 0;

    const visitCountDiff =
      currentMonthToDateVisits.length - previousMonthSameDayVisits.length;

    const visitCountDiffRate =
      previousMonthSameDayVisits.length > 0
        ? (visitCountDiff / previousMonthSameDayVisits.length) * 100
        : currentMonthToDateVisits.length > 0
        ? 100
        : 0;

    const monthlyCustomerIds = Array.from(
      new Set(
        currentMonthToDateVisits
          .map((visit) => visit.customer_id)
          .filter((customerId): customerId is string => Boolean(customerId))
      )
    );

    const repeatCustomerIds = monthlyCustomerIds.filter((customerId) => {
      return visits.some((visit) => {
        if (visit.customer_id !== customerId) return false;
        if (!visit.visit_date) return false;

        return visit.visit_date.slice(0, 10) < currentMonthStart;
      });
    });

    const repeatRate =
      monthlyCustomerIds.length > 0
        ? (repeatCustomerIds.length / monthlyCustomerIds.length) * 100
        : 0;

    const futureReservationCustomerIds = new Set(
      activeReservations
        .filter((reservation) => {
          const reservationDate = getReservationDate(reservation);
          if (!reservationDate) return false;
          return reservationDate >= today;
        })
        .map((reservation) => reservation.customer_id)
        .filter((customerId): customerId is string => Boolean(customerId))
    );

    const nextBookedCustomerIds = monthlyCustomerIds.filter((customerId) =>
      futureReservationCustomerIds.has(customerId)
    );

    const nextReservationRate =
      monthlyCustomerIds.length > 0
        ? (nextBookedCustomerIds.length / monthlyCustomerIds.length) * 100
        : 0;

    const nextMonthBookedCustomerIds = Array.from(
      new Set(
        activeReservations
          .filter((reservation) => {
            const reservationDate = getReservationDate(reservation);
            if (!reservationDate) return false;
            return reservationDate >= nextMonthStart && reservationDate <= nextMonthEnd;
          })
          .map((reservation) => reservation.customer_id)
          .filter((customerId): customerId is string => Boolean(customerId))
      )
    );

    return {
      monthlySales,
      previousSameDaySales,
      salesDiff,
      salesDiffRate,
      currentMonthStart,
      currentSameDayEnd,
      previousMonthStart,
      previousMonthSameDayEnd,
      monthlyVisitCount: currentMonthToDateVisits.length,
      previousSameDayVisitCount: previousMonthSameDayVisits.length,
      visitCountDiff,
      visitCountDiffRate,
      monthlyCustomerCount: monthlyCustomerIds.length,
      repeatCustomerCount: repeatCustomerIds.length,
      repeatRate,
      nextReservationCustomerCount: nextBookedCustomerIds.length,
      nextReservationRate,
      nextMonthStart,
      nextMonthEnd,
      nextMonthBookedCustomerCount: nextMonthBookedCustomerIds.length,
    };
  }, [visits, activeReservations, today]);

  const totalSales = visits.reduce((sum, visit) => {
    return sum + (visit.price || 0);
  }, 0);

  if (loading) {
    return (
      <div className="p-4">
        <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow">
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ダッシュボード</h1>

        <Link
          href="/visits/new"
          className="rounded-lg bg-black px-4 py-2 text-white"
        >
          来店登録
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-slate-600">今日の売上</p>
          <p className="mt-1 text-3xl font-bold">{formatYen(todaySales)}</p>
          <p className="mt-2 text-sm text-slate-600">
            来店数: {todayVisitCount}件
          </p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-slate-600">今日の予約数</p>
          <p className="mt-1 text-3xl font-bold text-blue-600">
            {todayReservationCount}件
          </p>
          <p className="mt-2 text-sm text-slate-600">
            キャンセルを除いた予約件数
          </p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-slate-600">来月予約済人数</p>
          <p className="mt-1 text-3xl font-bold text-purple-600">
            {monthlyStats.nextMonthBookedCustomerCount}人
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {monthlyStats.nextMonthStart}〜{monthlyStats.nextMonthEnd}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-slate-600">今月の売上</p>
          <p className="mt-1 text-3xl font-bold">
            {formatYen(monthlyStats.monthlySales)}
          </p>

          <div className="mt-3 rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">前月同日比</p>
            <p
              className={`mt-1 text-lg font-black ${
                monthlyStats.salesDiff >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatPercent(monthlyStats.salesDiffRate)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              差額: {formatDiffYen(monthlyStats.salesDiff)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              今月 {monthlyStats.currentMonthStart}〜
              {monthlyStats.currentSameDayEnd} / 前月{" "}
              {monthlyStats.previousMonthStart}〜
              {monthlyStats.previousMonthSameDayEnd}
            </p>
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">
              今月来店数 前月同日比
            </p>
            <p
              className={`mt-1 text-lg font-black ${
                monthlyStats.visitCountDiff >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }`}
            >
              {formatPercent(monthlyStats.visitCountDiffRate)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              差分: {formatDiffCount(monthlyStats.visitCountDiff)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              今月 {monthlyStats.monthlyVisitCount}件 / 前月同日{" "}
              {monthlyStats.previousSameDayVisitCount}件
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-slate-600">次回予約率</p>
          <p className="mt-1 text-3xl font-bold text-blue-600">
            {formatPlainPercent(monthlyStats.nextReservationRate)}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            今月来店 {monthlyStats.monthlyCustomerCount}人 / 次回予約あり{" "}
            {monthlyStats.nextReservationCustomerCount}人
          </p>
          <p className="mt-1 text-xs text-slate-400">
            今月来店したお客様のうち、今日以降の予約が入っている割合です。
          </p>

          <div className="mt-4 rounded-2xl bg-rose-50 p-3">
            <p className="text-sm text-slate-600">今月リピート率</p>
            <p className="mt-1 text-2xl font-bold text-rose-600">
              {formatPlainPercent(monthlyStats.repeatRate)}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              今月来店 {monthlyStats.monthlyCustomerCount}人 / リピート{" "}
              {monthlyStats.repeatCustomerCount}人
            </p>
            <p className="mt-1 text-xs text-slate-400">
              今月来店したお客様のうち、過去にも来店履歴がある割合です。
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <p className="text-sm text-slate-600">累計売上</p>
        <p className="mt-1 text-3xl font-bold">{formatYen(totalSales)}</p>
        <p className="mt-2 text-sm text-slate-600">
          顧客数: {customers.length}人
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Link
          href="/customers"
          className="rounded-xl bg-white p-4 text-center font-semibold shadow"
        >
          👤 顧客
        </Link>

        <Link
          href="/visits"
          className="rounded-xl bg-white p-4 text-center font-semibold shadow"
        >
          💅 来店
        </Link>

        <Link
          href="/reports/daily"
          className="rounded-xl bg-white p-4 text-center font-semibold shadow"
        >
          📊 日別売上
        </Link>
      </div>
    </div>
  );
}