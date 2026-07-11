"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type VisitRow = {
  id: string;
  price: number | null;
  visit_date: string | null;
  customer_id: string | null;
  next_visit_date: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
};

type ReceivableRow = {
  id: string;
  amount: number | null;
  status: string | null;
};

type ReservationRow = {
  id: string;
  customer_id?: string | null;
  staff_id?: string | null;
  status?: string | null;
  reservation_date?: string | null;
  reservation_time?: string | null;
  date?: string | null;
  time?: string | null;
  reserved_at?: string | null;
  visit_date?: string | null;
  menu_name?: string | null;
  menu?: string | null;
  staff_name?: string | null;
  staff?: string | null;
  duration_minutes?: number | string | null;
  duration?: number | string | null;
  start_at?: string | null;
  memo?: string | null;
  note?: string | null;
  [key: string]: unknown;
};

type TodayReservation = {
  id: string;
  customerId: string | null;
  customerName: string;
  reservationDate: string | null;
  reservationTime: string | null;
  menuName: string;
  staffName: string;
  status: string;
  memo: string;
};

type ReservationGroup = {
  staffName: string;
  items: TodayReservation[];
};

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function toDateOnlyString(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function pickString(
  row: ReservationRow,
  keys: string[],
  fallback = ""
): string {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function pickNullableString(
  row: ReservationRow,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeSupabaseDateTime(value: string | null) {
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

function isDateTimeText(value: string | null) {
  if (!value) return false;

  return (
    value.includes("T") ||
    value.includes(" ") ||
    /[zZ]$/.test(value) ||
    /[+-]\d{2}:\d{2}$/.test(value)
  );
}

function getJstParts(value: string | null) {
  const normalizedValue = normalizeSupabaseDateTime(value);

  if (!normalizedValue) return null;

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: map.get("year") || "",
    month: map.get("month") || "",
    day: map.get("day") || "",
    hour: map.get("hour") || "",
    minute: map.get("minute") || "",
  };
}

function normalizeDateText(value: string | null) {
  if (!value) return null;

  if (isDateTimeText(value)) {
    const parts = getJstParts(value);

    if (!parts) return null;

    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  return value.slice(0, 10);
}

function normalizeTimeText(value: string | null) {
  if (!value) return null;

  if (isDateTimeText(value)) {
    const parts = getJstParts(value);

    if (!parts) return null;

    return `${parts.hour}:${parts.minute}`;
  }

  return value.slice(0, 5);
}

function buildReservationDate(row: ReservationRow) {
  return normalizeDateText(
    pickNullableString(row, [
      "start_at",
      "reservation_date",
      "date",
      "visit_date",
      "reserved_at",
    ])
  );
}

function buildReservationTime(row: ReservationRow) {
  return normalizeTimeText(
    pickNullableString(row, ["start_at", "reservation_time", "time"])
  );
}

function normalizeStatus(row: ReservationRow) {
  const raw = pickString(row, ["status"], "予約");

  if (raw === "requested") return "予約申請中";
  if (raw === "confirmed") return "予約確定";
  if (raw === "completed") return "完了";
  if (raw === "cancelled") return "キャンセル";
  if (raw === "予約") return "予約受付";

  return raw;
}

function normalizeMenuName(row: ReservationRow) {
  return pickString(row, ["menu_name", "menu"], "未設定");
}

function normalizeMemo(row: ReservationRow) {
  return pickString(row, ["memo", "note"], "");
}

function getStatusBadgeClass(status: string) {
  if (
    status === "予約申請中" ||
    status === "予約受付" ||
    status === "予約"
  ) {
    return "bg-pink-100 text-pink-700";
  }

  if (status === "予約確定" || status === "confirmed") {
    return "bg-blue-100 text-blue-700";
  }

  if (status === "来店予定" || status === "来店") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "完了待ち") {
    return "bg-amber-100 text-amber-700";
  }

  if (status === "完了" || status === "completed") {
    return "bg-slate-100 text-slate-700";
  }

  if (status === "キャンセル" || status === "cancelled") {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-gray-100 text-gray-700";
}

function sortByTime(a: TodayReservation, b: TodayReservation) {
  const aTime = a.reservationTime || "99:99";
  const bTime = b.reservationTime || "99:99";

  return aTime.localeCompare(bTime);
}

function getStatusOrder(status: string) {
  if (
    status === "予約申請中" ||
    status === "予約受付" ||
    status === "予約"
  ) {
    return 1;
  }

  if (status === "予約確定" || status === "confirmed") return 2;
  if (status === "来店予定" || status === "来店") return 3;
  if (status === "完了待ち") return 4;
  if (status === "完了" || status === "completed") return 5;
  if (status === "キャンセル" || status === "cancelled") return 6;

  return 9;
}

function sortByStatusThenTime(
  a: TodayReservation,
  b: TodayReservation
) {
  const statusDiff =
    getStatusOrder(a.status) - getStatusOrder(b.status);

  if (statusDiff !== 0) return statusDiff;

  return sortByTime(a, b);
}

function buildVisitLink(item: TodayReservation) {
  const params = new URLSearchParams();

  if (item.customerId) {
    params.set("customer_id", item.customerId);
  }

  params.set("reservation_id", item.id);

  if (item.reservationDate) {
    params.set("visit_date", item.reservationDate);
  }

  if (item.menuName && item.menuName !== "未設定") {
    params.set("menu_name", item.menuName);
  }

  if (item.staffName && item.staffName !== "未設定") {
    params.set("staff_name", item.staffName);
  }

  if (item.memo) {
    params.set("memo", item.memo);
  }

  return `/visits/new?${params.toString()}`;
}

function staffSort(a: string, b: string) {
  if (a === "未設定" && b !== "未設定") return 1;
  if (a !== "未設定" && b === "未設定") return -1;

  return a.localeCompare(b, "ja");
}

export default function DashboardPageClient() {
  const [loading, setLoading] = useState(true);

  const [customersCount, setCustomersCount] = useState(0);
  const [visitsCount, setVisitsCount] = useState(0);
  const [todaySales, setTodaySales] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [monthSales, setMonthSales] = useState(0);
  const [previousMonthSales, setPreviousMonthSales] = useState(0);
  const [repeatRate, setRepeatRate] = useState(0);
  const [repeatCustomerCount, setRepeatCustomerCount] = useState(0);
  const [visitedCustomerCount, setVisitedCustomerCount] = useState(0);
  const [nextVisitCount, setNextVisitCount] = useState(0);
  const [pendingReservationCount, setPendingReservationCount] = useState(0);
  const [todayReservations, setTodayReservations] = useState<
    TodayReservation[]
  >([]);

  useEffect(() => {
    void fetchDashboardData();
  }, []);

  async function handleStaffLogout() {
    try {
      await fetch("/api/staff-login/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/login";
    }
  }

  async function fetchDashboardData() {
    setLoading(true);

    const today = new Date();
    const todayText = toDateOnlyString(today);
    const currentMonthKey = getMonthKey(today);

    const previousMonthDate = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1
    );

    const previousMonthKey = getMonthKey(previousMonthDate);

    const [
      customersResult,
      staffsResult,
      visitsResult,
      receivablesResult,
      reservationsResult,
    ] = await Promise.all([
      supabase.from("customers").select("id, name"),
      supabase.from("staffs").select("id, name"),
      supabase
        .from("visits")
        .select(
          "id, price, visit_date, customer_id, next_visit_date"
        )
        .order("visit_date", { ascending: false }),
      supabase.from("receivables").select("id, amount, status"),
      supabase
        .from("reservations")
        .select("*")
        .order("created_at", {
          ascending: false,
        }),
    ]);

    const customers = (customersResult.data || []) as CustomerRow[];
    const staffs = (staffsResult.data || []) as StaffRow[];
    const visits = (visitsResult.data || []) as VisitRow[];
    const receivables = (receivablesResult.data || []) as ReceivableRow[];
    const reservations = (reservationsResult.data ||
      []) as ReservationRow[];

    void receivables;

    const customerMap: Record<string, string> = {};

    customers.forEach((customer) => {
      customerMap[customer.id] =
        customer.name || "顧客名未設定";
    });

    const staffMap: Record<string, string> = {};

    staffs.forEach((staff) => {
      staffMap[staff.id] = staff.name || "未設定";
    });

    setCustomersCount(customers.length);
    setVisitsCount(visits.length);

    const todayVisitRows = visits.filter(
      (row) => row.visit_date === todayText
    );

    const todaySalesTotal = todayVisitRows.reduce(
      (sum, row) => sum + Number(row.price || 0),
      0
    );

    const currentMonthVisits = visits.filter((row) =>
      (row.visit_date || "").startsWith(currentMonthKey)
    );

    const previousMonthVisits = visits.filter((row) =>
      (row.visit_date || "").startsWith(previousMonthKey)
    );

    const currentMonthSales = currentMonthVisits.reduce(
      (sum, row) => sum + Number(row.price || 0),
      0
    );

    const previousSales = previousMonthVisits.reduce(
      (sum, row) => sum + Number(row.price || 0),
      0
    );

    const visitCountByCustomer = new Map<string, number>();

    visits.forEach((row) => {
      if (!row.customer_id) return;

      const currentCount =
        visitCountByCustomer.get(row.customer_id) || 0;

      visitCountByCustomer.set(
        row.customer_id,
        currentCount + 1
      );
    });

    const visitedCustomers = Array.from(
      visitCountByCustomer.entries()
    );

    const repeatCustomers = visitedCustomers.filter(
      ([, count]) => count >= 2
    );

    const repeatRateValue =
      visitedCustomers.length > 0
        ? (repeatCustomers.length / visitedCustomers.length) * 100
        : 0;

    const nextVisits = currentMonthVisits.filter(
      (row) =>
        typeof row.next_visit_date === "string" &&
        row.next_visit_date.trim() !== ""
    );

    const pendingCount = reservations.filter((row) => {
      const status = normalizeStatus(row);
      return (
        status === "予約申請中" ||
        status === "予約受付" ||
        status === "予約"
      );
    }).length;

    const normalizedTodayReservations = reservations
      .map((row) => {
        const customerId =
          typeof row.customer_id === "string"
            ? row.customer_id
            : null;

        const staffId =
          typeof row.staff_id === "string"
            ? row.staff_id
            : null;

        const directStaffName = pickString(
          row,
          ["staff_name", "staff"],
          ""
        );

        const resolvedStaffName = directStaffName
          ? directStaffName
          : staffId
          ? staffMap[staffId] || "未設定"
          : "未設定";

        return {
          id: String(row.id || ""),
          customerId,
          customerName: customerId
            ? customerMap[customerId] || "顧客名未設定"
            : "顧客未設定",
          reservationDate: buildReservationDate(row),
          reservationTime: buildReservationTime(row),
          menuName: normalizeMenuName(row),
          staffName: resolvedStaffName,
          status: normalizeStatus(row),
          memo: normalizeMemo(row),
        } as TodayReservation;
      })
      .filter((row) => row.reservationDate === todayText);

    setTodaySales(todaySalesTotal);
    setTodayCount(todayVisitRows.length);
    setMonthSales(currentMonthSales);
    setPreviousMonthSales(previousSales);
    setRepeatRate(repeatRateValue);
    setRepeatCustomerCount(repeatCustomers.length);
    setVisitedCustomerCount(visitedCustomers.length);
    setNextVisitCount(nextVisits.length);
    setPendingReservationCount(pendingCount);
    setTodayReservations(normalizedTodayReservations);

    setLoading(false);
  }

  const monthDiff = useMemo(() => {
    return monthSales - previousMonthSales;
  }, [monthSales, previousMonthSales]);

  const monthDiffRate = useMemo(() => {
    if (previousMonthSales === 0) {
      if (monthSales === 0) return 0;

      return 100;
    }

    return (
      ((monthSales - previousMonthSales) /
        previousMonthSales) *
      100
    );
  }, [monthSales, previousMonthSales]);

  const monthDiffLabel =
    monthDiff > 0
      ? "先月よりアップ"
      : monthDiff < 0
      ? "先月よりダウン"
      : "先月と同じくらい";

  const reservationGroups = useMemo<ReservationGroup[]>(() => {
    const map = new Map<string, TodayReservation[]>();

    todayReservations.forEach((item) => {
      const key = item.staffName || "未設定";
      const previousItems = map.get(key) || [];

      previousItems.push(item);
      map.set(key, previousItems);
    });

    return Array.from(map.entries())
      .sort((a, b) => staffSort(a[0], b[0]))
      .map(([staffName, items]) => ({
        staffName,
        items: [...items].sort(sortByStatusThenTime),
      }));
  }, [todayReservations]);

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto w-full max-w-[1100px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-orange-400 via-rose-400 to-pink-400 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>

              <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
                スタッフページ
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-white/90">
                今日のご予約やお店の流れを、見やすくまとめた店舗ページです。
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 lg:w-auto lg:min-w-[420px]">
              <Link
                href="/visits/new"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-3 py-3 text-center text-sm font-bold text-rose-500 shadow"
              >
                来店登録
              </Link>

              <Link
                href="/nail-tip-orders"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/40 bg-white/15 px-3 py-3 text-center text-sm font-bold text-white backdrop-blur"
              >
                ネイルチップ注文
              </Link>

              <Link
                href="/staff-tools"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/40 bg-white/15 px-3 py-3 text-center text-sm font-bold text-white backdrop-blur"
              >
                管理・便利ツール
              </Link>

              <button
                type="button"
                onClick={handleStaffLogout}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/40 bg-white/15 px-3 py-3 text-center text-sm font-bold text-white backdrop-blur"
              >
                ログアウト
              </button>
            </div>
          </div>
        </section>

        {pendingReservationCount > 0 ? (
          <Link
            href="/reservations?view=pending"
            className="block rounded-[28px] border-2 border-amber-300 bg-amber-50 p-5 shadow-sm transition hover:bg-amber-100"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black tracking-[0.16em] text-amber-700">
                  要対応
                </div>
                <div className="mt-2 text-xl font-black text-amber-950">
                  未確認の予約希望が{pendingReservationCount}件あります
                </div>
                <div className="mt-2 text-sm leading-6 text-amber-800">
                  予約日が先でも表示しています。内容を確認し、予約確定・LINE送信まで対応してください。
                </div>
              </div>
              <span className="inline-flex shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white">
                {pendingReservationCount > 9 ? "9+" : pendingReservationCount}
              </span>
            </div>
            <div className="mt-4 rounded-2xl bg-amber-500 px-4 py-3 text-center text-sm font-bold text-white">
              未確認予約を確認する
            </div>
          </Link>
        ) : null}

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">
              今日の売上
            </div>

            <div className="mt-2 text-2xl font-bold text-gray-900">
              {formatYen(todaySales)}
            </div>

            <div className="mt-2 text-sm text-gray-500">
              来店数 {todayCount}件
            </div>
          </div>

          <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">
              今月の売上
            </div>

            <div className="mt-2 text-2xl font-bold text-gray-900">
              {formatYen(monthSales)}
            </div>

            <div className="mt-2 text-sm text-gray-500">
              {monthDiffLabel}
            </div>
          </div>

          <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">前月比</div>

            <div
              className={`mt-2 text-2xl font-bold ${
                monthDiffRate >= 0
                  ? "text-pink-600"
                  : "text-rose-500"
              }`}
            >
              {monthDiffRate >= 0 ? "+" : ""}
              {Math.round(monthDiffRate)}%
            </div>

            <div className="mt-2 text-sm text-gray-500">
              差額 {formatYen(monthDiff)}
            </div>
          </div>

          <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">
              リピート率
            </div>

            <div className="mt-2 text-2xl font-bold text-pink-600">
              {Math.round(repeatRate)}%
            </div>

            <div className="mt-2 text-sm text-gray-500">
              2回来店以上 {repeatCustomerCount}人 / 来店あり{" "}
              {visitedCustomerCount}人
            </div>
          </div>

          <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">顧客数</div>

            <div className="mt-2 text-2xl font-bold text-gray-900">
              {customersCount}人
            </div>

            <div className="mt-2 text-sm text-gray-500">
              登録中のお客様
            </div>
          </div>

          <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">
              来店履歴数
            </div>

            <div className="mt-2 text-2xl font-bold text-gray-900">
              {visitsCount}件
            </div>

            <div className="mt-2 text-sm text-gray-500">
              次回来店のご提案 {nextVisitCount}件
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-lg font-bold text-gray-900">
                今日の予定一覧
              </div>

              <div className="mt-1 text-sm text-gray-500">
                今日のご予約を、担当者ごとに見やすくまとめています。
              </div>
            </div>

            <Link
              href="/reservations"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 sm:w-auto"
            >
              予約一覧へ
            </Link>
          </div>

          {todayReservations.length === 0 ? (
            <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-400">
              今日の予定はまだありません
            </div>
          ) : (
            <div className="space-y-4">
              {reservationGroups.map((group) => (
                <div
                  key={group.staffName}
                  className="rounded-3xl border border-rose-100 bg-rose-50/50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-slate-900">
                        担当: {group.staffName}
                      </div>

                      <div className="mt-1 text-sm text-slate-500">
                        {group.items.length}件
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-3xl border border-white bg-white p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="break-words text-base font-bold text-slate-900">
                                {item.customerName}
                              </div>

                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusBadgeClass(
                                  item.status
                                )}`}
                              >
                                {item.status}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-1 text-sm text-slate-700">
                              <div>
                                <span className="font-medium">
                                  時間:
                                </span>{" "}
                                {item.reservationTime || "未設定"}
                              </div>

                              <div className="break-words">
                                <span className="font-medium">
                                  メニュー:
                                </span>{" "}
                                {item.menuName}
                              </div>

                              <div>
                                <span className="font-medium">
                                  担当:
                                </span>{" "}
                                {item.staffName}
                              </div>
                            </div>
                          </div>

                          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                            <Link
                              href={`/reservations/edit/${item.id}`}
                              className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 py-2 text-center text-sm font-bold text-rose-600"
                            >
                              予約編集
                            </Link>

                            <Link
                              href={buildVisitLink(item)}
                              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-3 py-2 text-center text-sm font-bold text-white"
                            >
                              来店登録へ
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}