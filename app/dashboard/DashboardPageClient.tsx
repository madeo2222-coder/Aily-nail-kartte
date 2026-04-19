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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toDateOnlyString(date: Date) {
  return date.toISOString().split("T")[0];
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

function normalizeDateText(value: string | null) {
  if (!value) return null;
  return value.slice(0, 10);
}

function normalizeTimeText(value: string | null) {
  if (!value) return null;

  if (value.includes("T")) {
    const sliced = value.slice(11, 16);
    return sliced.length === 5 ? sliced : null;
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
  if (status === "予約受付" || status === "予約") {
    return "bg-blue-100 text-blue-700";
  }
  if (status === "来店予定" || status === "来店") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "完了待ち") {
    return "bg-amber-100 text-amber-700";
  }
  if (status === "完了") {
    return "bg-slate-100 text-slate-700";
  }
  if (status === "キャンセル") {
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
  if (status === "予約受付" || status === "予約") return 1;
  if (status === "来店予定" || status === "来店") return 2;
  if (status === "完了待ち") return 3;
  if (status === "完了") return 4;
  if (status === "キャンセル") return 5;
  return 9;
}

function sortByStatusThenTime(a: TodayReservation, b: TodayReservation) {
  const statusDiff = getStatusOrder(a.status) - getStatusOrder(b.status);
  if (statusDiff !== 0) return statusDiff;
  return sortByTime(a, b);
}

function buildVisitLink(item: TodayReservation) {
  const params = new URLSearchParams();

  if (item.customerId) params.set("customer_id", item.customerId);
  params.set("reservation_id", item.id);

  if (item.reservationDate) params.set("visit_date", item.reservationDate);
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
  const [monthReceivables, setMonthReceivables] = useState(0);
  const [nextVisitCount, setNextVisitCount] = useState(0);
  const [todayReservations, setTodayReservations] = useState<TodayReservation[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);

    const today = new Date();
    const todayText = toDateOnlyString(today);
    const currentMonthKey = getMonthKey(today);

    const previousMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
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
        .select("id, price, visit_date, customer_id, next_visit_date")
        .order("visit_date", { ascending: false }),
      supabase.from("receivables").select("id, amount, status"),
      supabase.from("reservations").select("*").order("created_at", { ascending: false }),
    ]);

    const customers = (customersResult.data || []) as CustomerRow[];
    const staffs = (staffsResult.data || []) as StaffRow[];
    const visits = (visitsResult.data || []) as VisitRow[];
    const receivables = (receivablesResult.data || []) as ReceivableRow[];
    const reservations = (reservationsResult.data || []) as ReservationRow[];

    const customerMap: Record<string, string> = {};
    customers.forEach((customer) => {
      customerMap[customer.id] = customer.name || "顧客名未設定";
    });

    const staffMap: Record<string, string> = {};
    staffs.forEach((staff) => {
      staffMap[staff.id] = staff.name || "未設定";
    });

    setCustomersCount(customers.length);
    setVisitsCount(visits.length);

    const todayVisitRows = visits.filter((row) => row.visit_date === todayText);
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

    const unpaidTotal = receivables
      .filter((row) => row.status !== "paid")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const nextVisits = currentMonthVisits.filter(
      (row) => typeof row.next_visit_date === "string" && row.next_visit_date.trim() !== ""
    );

    const normalizedTodayReservations = reservations
      .map((row) => {
        const customerId =
          typeof row.customer_id === "string" ? row.customer_id : null;

        const staffId =
          typeof row.staff_id === "string" ? row.staff_id : null;

        const directStaffName = pickString(row, ["staff_name", "staff"], "");
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
    setMonthReceivables(unpaidTotal);
    setNextVisitCount(nextVisits.length);
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
    return ((monthSales - previousMonthSales) / previousMonthSales) * 100;
  }, [monthSales, previousMonthSales]);

  const monthDiffLabel =
    monthDiff > 0 ? "先月より増加" : monthDiff < 0 ? "先月より減少" : "先月と同水準";

  const reservationGroups = useMemo<ReservationGroup[]>(() => {
    const map = new Map<string, TodayReservation[]>();

    todayReservations.forEach((item) => {
      const key = item.staffName || "未設定";
      const prev = map.get(key) || [];
      prev.push(item);
      map.set(key, prev);
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
    <div className="space-y-4 p-4 pb-24">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 to-amber-400 p-5 text-white shadow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-white/80">
              NAILY AIDOL
            </p>
            <h1 className="mt-2 text-2xl font-bold">スタッフダッシュボード</h1>
            <p className="mt-2 text-sm leading-6 text-white/90">
              今日の営業と今月の流れを、すぐ見れる現場向けホームです。
            </p>
          </div>

          <Link
            href="/visits/new"
            className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-orange-600 shadow"
          >
            来店登録
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">今日の売上</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">
            {formatYen(todaySales)}
          </div>
          <div className="mt-2 text-sm text-gray-500">来店数 {todayCount}件</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">今月の売上</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">
            {formatYen(monthSales)}
          </div>
          <div className="mt-2 text-sm text-gray-500">{monthDiffLabel}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">前月比</div>
          <div
            className={`mt-2 text-2xl font-bold ${
              monthDiffRate >= 0 ? "text-blue-600" : "text-red-500"
            }`}
          >
            {monthDiffRate >= 0 ? "+" : ""}
            {Math.round(monthDiffRate)}%
          </div>
          <div className="mt-2 text-sm text-gray-500">
            差額 {formatYen(monthDiff)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">未収</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">
            {formatYen(monthReceivables)}
          </div>
          <div className="mt-2 text-sm text-gray-500">要確認</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">顧客数</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">
            {customersCount}人
          </div>
          <div className="mt-2 text-sm text-gray-500">累計登録</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">来店履歴数</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">
            {visitsCount}件
          </div>
          <div className="mt-2 text-sm text-gray-500">
            次回来店提案 {nextVisitCount}件
          </div>
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-gray-900">今日の予定一覧</div>
            <div className="mt-1 text-sm text-gray-500">
              今日の予約を担当者ごと・状態順・時間順に表示しています。
            </div>
          </div>

          <Link
            href="/reservations"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
          >
            予約一覧へ
          </Link>
        </div>

        {todayReservations.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            今日の予定はありません
          </div>
        ) : (
          <div className="space-y-4">
            {reservationGroups.map((group) => (
              <div key={group.staffName} className="rounded-2xl border bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-slate-900">
                      担当者: {group.staffName}
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
                      className="rounded-2xl border bg-white p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-bold text-slate-900">
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
                              <span className="font-medium">時間:</span>{" "}
                              {item.reservationTime || "未設定"}
                            </div>
                            <div>
                              <span className="font-medium">メニュー:</span>{" "}
                              {item.menuName}
                            </div>
                            <div>
                              <span className="font-medium">担当者:</span>{" "}
                              {item.staffName}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/reservations/edit/${item.id}`}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
                          >
                            予約編集
                          </Link>

                          <Link
                            href={buildVisitLink(item)}
                            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
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
      </div>

      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-gray-900">現場メニュー</div>
            <div className="mt-1 text-sm text-gray-500">
              スタッフがよく使う導線を優先しています。
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/customers"
            className="rounded-2xl bg-gray-50 p-4 text-center shadow-sm"
          >
            <div className="text-2xl">👤</div>
            <div className="mt-2 text-sm font-bold text-gray-900">顧客</div>
          </Link>

          <Link
            href="/visits"
            className="rounded-2xl bg-gray-50 p-4 text-center shadow-sm"
          >
            <div className="text-2xl">💅</div>
            <div className="mt-2 text-sm font-bold text-gray-900">来店</div>
          </Link>

          <Link
            href="/receivables"
            className="rounded-2xl bg-gray-50 p-4 text-center shadow-sm"
          >
            <div className="text-2xl">💰</div>
            <div className="mt-2 text-sm font-bold text-gray-900">未収</div>
          </Link>

          <Link
            href="/staff"
            className="rounded-2xl bg-gray-50 p-4 text-center shadow-sm"
          >
            <div className="text-2xl">🧑‍🤝‍🧑</div>
            <div className="mt-2 text-sm font-bold text-gray-900">スタッフ</div>
          </Link>

          <Link
            href="/customer-intake/list"
            className="rounded-2xl bg-gray-50 p-4 text-center shadow-sm"
          >
            <div className="text-2xl">📝</div>
            <div className="mt-2 text-sm font-bold text-gray-900">初回入力</div>
          </Link>

          <Link
            href="/reports/daily"
            className="rounded-2xl bg-gray-50 p-4 text-center shadow-sm"
          >
            <div className="text-2xl">📊</div>
            <div className="mt-2 text-sm font-bold text-gray-900">日別売上</div>
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border bg-slate-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-bold text-slate-900">
              オーナー向け経営ボード
            </div>
            <div className="mt-1 text-sm text-slate-600">
              経営・税理士提出・収支確認は別ページに分けました。
            </div>
          </div>

          <Link
            href="/owner-dashboard"
            className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
          >
            経営ボードへ
          </Link>
        </div>
      </div>
    </div>
  );
}