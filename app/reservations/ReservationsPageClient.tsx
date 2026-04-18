"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ReservationRow = {
  id: string;
  customer_id?: string | null;
  status?: string | null;
  created_at?: string | null;
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
  source?: string | null;
  memo?: string | null;
  note?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  [key: string]: unknown;
};

type CustomerRow = {
  id: string;
  name: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
};

type NormalizedReservation = {
  id: string;
  customerId: string | null;
  customerName: string;
  staffId: string | null;
  staffName: string;
  status: string;
  reservationDate: string | null;
  reservationTime: string | null;
  menuName: string;
  durationMinutes: number;
  source: string;
  memo: string;
  createdAt: string | null;
};

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

function pickNumber(
  row: ReservationRow,
  keys: string[],
  fallback = 0
): number {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function normalizeDateText(value: string | null) {
  if (!value) return null;
  return value.slice(0, 10);
}

function normalizeTimeText(value: string | null) {
  if (!value) return null;
  return value.slice(11, 16).length === 5 ? value.slice(11, 16) : value.slice(0, 5);
}

function formatDateLabel(value: string | null) {
  if (!value) return "未設定";
  const normalized = value.slice(0, 10);
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return normalized;
  return `${year}/${Number(month)}/${Number(day)}`;
}

function formatTimeRange(startTime: string | null, durationMinutes: number) {
  if (!startTime) return "未設定";

  const [hourText, minuteText] = startTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return startTime;
  }

  const startTotal = hour * 60 + minute;
  const endTotal = startTotal + durationMinutes;
  const endHour = Math.floor(endTotal / 60);
  const endMinute = endTotal % 60;

  return `${startTime}〜${String(endHour).padStart(2, "0")}:${String(
    endMinute
  ).padStart(2, "0")}`;
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

function buildReservationDate(row: ReservationRow) {
  return normalizeDateText(
    pickNullableString(row, [
      "start_at",
      "reservation_date",
      "date",
      "visit_date",
      "reserved_at",
      "created_at",
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

function normalizeSource(row: ReservationRow) {
  return pickString(row, ["source"], "手入力");
}

function normalizeMenuName(row: ReservationRow) {
  return pickString(row, ["menu_name", "menu"], "未設定");
}

function normalizeMemo(row: ReservationRow) {
  return pickString(row, ["memo", "note"], "");
}

function diffMinutes(startAt: string | null, endAt: string | null) {
  if (!startAt || !endAt) return null;

  const start = new Date(startAt);
  const end = new Date(endAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  return minutes;
}

function normalizeDurationMinutes(row: ReservationRow) {
  const byColumns = pickNumber(row, ["duration_minutes", "duration"], 0);
  if (byColumns > 0) return byColumns;

  const byStartEnd = diffMinutes(
    typeof row.start_at === "string" ? row.start_at : null,
    typeof row.end_at === "string" ? row.end_at : null
  );

  if (byStartEnd && byStartEnd > 0) return byStartEnd;

  return 60;
}

function hasOverlap(a: NormalizedReservation, b: NormalizedReservation) {
  if (a.id === b.id) return false;
  if (!a.reservationDate || !b.reservationDate) return false;
  if (!a.reservationTime || !b.reservationTime) return false;
  if (a.reservationDate !== b.reservationDate) return false;
  if (a.staffName !== b.staffName) return false;
  if (a.staffName === "未設定" || b.staffName === "未設定") return false;
  if (a.status === "キャンセル" || b.status === "キャンセル") return false;

  const [aHour, aMinute] = a.reservationTime.split(":").map(Number);
  const [bHour, bMinute] = b.reservationTime.split(":").map(Number);

  if (
    !Number.isFinite(aHour) ||
    !Number.isFinite(aMinute) ||
    !Number.isFinite(bHour) ||
    !Number.isFinite(bMinute)
  ) {
    return false;
  }

  const aStart = aHour * 60 + aMinute;
  const aEnd = aStart + a.durationMinutes;
  const bStart = bHour * 60 + bMinute;
  const bEnd = bStart + b.durationMinutes;

  return aStart < bEnd && bStart < aEnd;
}

function buildVisitLink(item: NormalizedReservation) {
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

export default function ReservationsPageClient() {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("全員");

  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    customers.forEach((customer) => {
      map[customer.id] = customer.name || "顧客名未設定";
    });
    return map;
  }, [customers]);

  const staffMap = useMemo(() => {
    const map: Record<string, string> = {};
    staffs.forEach((staff) => {
      map[staff.id] = staff.name || "名前未設定";
    });
    return map;
  }, [staffs]);

  async function fetchReservations() {
    setLoading(true);

    const [reservationsRes, customersRes, staffsRes] = await Promise.all([
      supabase
        .from("reservations")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name"),
      supabase.from("staffs").select("id, name"),
    ]);

    if (reservationsRes.error) {
      console.error("reservations fetch error:", reservationsRes.error.message);
      setReservations([]);
    } else {
      setReservations((reservationsRes.data as ReservationRow[]) || []);
    }

    if (customersRes.error) {
      console.error("customers fetch error:", customersRes.error.message);
      setCustomers([]);
    } else {
      setCustomers((customersRes.data as CustomerRow[]) || []);
    }

    if (staffsRes.error) {
      console.error("staffs fetch error:", staffsRes.error.message);
      setStaffs([]);
    } else {
      setStaffs((staffsRes.data as StaffRow[]) || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void fetchReservations();
  }, []);

  const normalizedReservations = useMemo<NormalizedReservation[]>(() => {
    return reservations.map((reservation) => {
      const customerId =
        typeof reservation.customer_id === "string"
          ? reservation.customer_id
          : null;

      const staffId =
        typeof reservation.staff_id === "string"
          ? reservation.staff_id
          : null;

      const customerName = customerId
        ? customerMap[customerId] || "顧客名未設定"
        : "顧客未設定";

      const reservationStaffName = pickString(
        reservation,
        ["staff_name", "staff"],
        ""
      );

      const staffName = reservationStaffName
        ? reservationStaffName
        : staffId
        ? staffMap[staffId] || "未設定"
        : "未設定";

      return {
        id: reservation.id,
        customerId,
        customerName,
        staffId,
        staffName,
        status: normalizeStatus(reservation),
        reservationDate: buildReservationDate(reservation),
        reservationTime: buildReservationTime(reservation),
        menuName: normalizeMenuName(reservation),
        durationMinutes: normalizeDurationMinutes(reservation),
        source: normalizeSource(reservation),
        memo: normalizeMemo(reservation),
        createdAt:
          typeof reservation.created_at === "string"
            ? reservation.created_at
            : null,
      };
    });
  }, [reservations, customerMap, staffMap]);

  useEffect(() => {
    if (selectedDate) return;

    const firstDate =
      normalizedReservations.find((row) => row.reservationDate)?.reservationDate ||
      "";

    if (firstDate) {
      setSelectedDate(firstDate);
    }
  }, [normalizedReservations, selectedDate]);

  const staffOptions = useMemo(() => {
    const set = new Set<string>();
    normalizedReservations.forEach((row) => {
      if (row.staffName && row.staffName !== "未設定") {
        set.add(row.staffName);
      }
    });
    return ["全員", ...Array.from(set)];
  }, [normalizedReservations]);

  const filteredReservations = useMemo(() => {
    return normalizedReservations.filter((row) => {
      const dateMatch = !selectedDate || row.reservationDate === selectedDate;
      const staffMatch = selectedStaff === "全員" || row.staffName === selectedStaff;
      return dateMatch && staffMatch;
    });
  }, [normalizedReservations, selectedDate, selectedStaff]);

  const overlapIds = useMemo(() => {
    const ids = new Set<string>();

    filteredReservations.forEach((currentItem) => {
      filteredReservations.forEach((otherItem) => {
        if (hasOverlap(currentItem, otherItem)) {
          ids.add(currentItem.id);
        }
      });
    });

    return ids;
  }, [filteredReservations]);

  const overlapReservations = useMemo(() => {
    return filteredReservations.filter((item) => overlapIds.has(item.id));
  }, [filteredReservations, overlapIds]);

  const reservationCount = filteredReservations.length;

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);

    const { error } = await supabase
      .from("reservations")
      .update({ status })
      .eq("id", id);

    setUpdatingId(null);

    if (error) {
      alert("更新に失敗しました: " + error.message);
      return;
    }

    await fetchReservations();
  }

  async function handleMarkVisited(id: string) {
    const ok = window.confirm("この予約を『来店』に変更しますか？");
    if (!ok) return;
    await updateStatus(id, "来店");
  }

  async function handleMarkCompleted(id: string) {
    const ok = window.confirm("この予約を『完了』に変更しますか？");
    if (!ok) return;
    await updateStatus(id, "完了");
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[920px] p-4" style={{ paddingBottom: "100px" }}>
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-500">
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div
        className="mx-auto w-full max-w-[920px] space-y-4 p-4"
        style={{ paddingBottom: "100px" }}
        suppressHydrationWarning
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-500">NAILY AIDOL</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">予約一覧</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              予約の確認・更新・重複注意の確認ができます。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/staff"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              スタッフ入口へ
            </Link>
            <Link
              href="/reservations/new"
              className="rounded-xl bg-black px-4 py-3 text-sm font-bold text-white"
            >
              新規予約
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">対象日の予約件数</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {reservationCount.toLocaleString()}件
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">重複注意</div>
            <div className="mt-2 text-2xl font-bold text-rose-600">
              {overlapReservations.length.toLocaleString()}件
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">運用状態</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              Supabase連携中
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-4">
            <div className="text-sm font-bold text-slate-900">絞り込み</div>
            <div className="mt-1 text-xs text-slate-500">
              日付と担当者で予約状況を確認できます。
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                対象日
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                suppressHydrationWarning
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                担当者
              </label>
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                suppressHydrationWarning
              >
                {staffOptions.map((staff) => (
                  <option key={staff} value={staff}>
                    {staff}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {overlapReservations.length > 0 ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
            <div className="text-sm font-bold text-rose-700">
              ダブルブッキング注意
            </div>
            <div className="mt-2 space-y-2 text-sm text-rose-700">
              {overlapReservations.map((item) => (
                <div key={item.id}>
                  {item.staffName} / {formatDateLabel(item.reservationDate)} /{" "}
                  {item.reservationTime || "時間未設定"} / {item.customerName}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="text-sm font-bold text-emerald-700">
              重複は見つかっていません
            </div>
            <div className="mt-2 text-sm text-emerald-700">
              同一スタッフ・同日・時間帯重複は現在ありません。
            </div>
          </div>
        )}

        {filteredReservations.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 text-center text-sm text-gray-500 shadow-sm">
            条件に合う予約はありません
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReservations.map((item) => {
              const isUpdating = updatingId === item.id;
              const isOverlap = overlapIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    isOverlap ? "border-rose-300 bg-rose-50" : "bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-bold text-slate-900">
                          {item.customerName}
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusBadgeClass(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {item.source || "手入力"}
                        </span>

                        {isOverlap ? (
                          <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                            重複注意
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-slate-700">
                        <div>
                          <span className="font-medium">予約日:</span>{" "}
                          {formatDateLabel(item.reservationDate)}
                        </div>

                        <div>
                          <span className="font-medium">時間:</span>{" "}
                          {formatTimeRange(item.reservationTime, item.durationMinutes)}
                        </div>

                        <div>
                          <span className="font-medium">メニュー:</span>{" "}
                          {item.menuName}
                        </div>

                        <div>
                          <span className="font-medium">担当者:</span>{" "}
                          {item.staffName}
                        </div>

                        <div>
                          <span className="font-medium">所要時間:</span>{" "}
                          {item.durationMinutes}分
                        </div>

                        <div>
                          <span className="font-medium">メモ:</span>{" "}
                          {item.memo || "なし"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/reservations/edit/${item.id}`}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                      >
                        編集
                      </Link>

                      {(item.status === "予約受付" || item.status === "予約") && (
                        <button
                          type="button"
                          onClick={() => handleMarkVisited(item.id)}
                          disabled={isUpdating}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"
                          suppressHydrationWarning
                        >
                          {isUpdating ? "更新中..." : "来店にする"}
                        </button>
                      )}

                      {(item.status === "来店予定" || item.status === "来店") && (
                        <button
                          type="button"
                          onClick={() => handleMarkCompleted(item.id)}
                          disabled={isUpdating}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"
                          suppressHydrationWarning
                        >
                          {isUpdating ? "更新中..." : "完了にする"}
                        </button>
                      )}

                      <Link
                        href={buildVisitLink(item)}
                        className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
                      >
                        来店登録へ
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}