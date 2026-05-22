"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ReservationRow = {
  id: string;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  menu_name?: string | null;
  status: string | null;
  memo: string | null;
  source?: string | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
};

type CalendarReservation = {
  id: string;
  customerName: string;
  staffId: string | null;
  staffName: string;
  menuName: string;
  status: string;
  source: string;
  memo: string;
  date: string;
  startTime: string;
  endTime: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
};

const DAY_START_HOUR = 10;
const DAY_END_HOUR = 20;
const SLOT_MINUTES = 30;

function getTodayText() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getJstParts(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
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

function toJstDateText(value: string | null) {
  const parts = getJstParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toJstTimeText(value: string | null) {
  const parts = getJstParts(value);
  if (!parts) return "";
  return `${parts.hour}:${parts.minute}`;
}

function timeTextToMinute(time: string) {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function addDaysText(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(dateText: string) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return dateText;

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}（${
    weekdays[date.getDay()]
  }）`;
}

function normalizeStatus(status: string | null) {
  if (status === "requested") return "予約申請中";
  if (status === "confirmed") return "予約確定";
  if (status === "completed") return "完了";
  if (status === "cancelled") return "キャンセル";
  if (status === "予約") return "予約受付";
  return status || "予約申請中";
}

function getStatusColor(status: string, source: string) {
  const sourceText = source || "";

  if (
    sourceText.includes("ホットペッパー") ||
    sourceText.includes("HPB") ||
    sourceText.includes("ミニモ") ||
    sourceText.includes("外部")
  ) {
    return "border-purple-200 bg-purple-100 text-purple-800";
  }

  if (status === "予約申請中" || status === "予約受付") {
    return "border-amber-200 bg-amber-100 text-amber-800";
  }

  if (status === "予約確定") {
    return "border-blue-200 bg-blue-100 text-blue-800";
  }

  if (status === "来店" || status === "来店予定") {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }

  if (status === "完了") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (status === "キャンセル") {
    return "border-rose-200 bg-rose-50 text-rose-600 opacity-60";
  }

  return "border-rose-100 bg-rose-50 text-rose-800";
}

function buildTimeSlots() {
  const slots: string[] = [];

  for (let hour = DAY_START_HOUR; hour <= DAY_END_HOUR; hour += 1) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
    if (hour !== DAY_END_HOUR) {
      slots.push(`${String(hour).padStart(2, "0")}:30`);
    }
  }

  return slots;
}

function hasOverlap(a: CalendarReservation, b: CalendarReservation) {
  if (a.id === b.id) return false;
  if (a.staffName !== b.staffName) return false;
  if (a.status === "キャンセル" || b.status === "キャンセル") return false;

  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

export default function ReservationsCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(getTodayText());
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchCalendarData() {
    setLoading(true);

    const [reservationsRes, customersRes, staffsRes] = await Promise.all([
      supabase
        .from("reservations")
        .select("*")
        .order("start_at", { ascending: true }),
      supabase.from("customers").select("id, name"),
      supabase.from("staffs").select("id, name"),
    ]);

    if (reservationsRes.error) {
      console.error("calendar reservations error:", reservationsRes.error);
      setReservations([]);
    } else {
      setReservations((reservationsRes.data || []) as ReservationRow[]);
    }

    if (customersRes.error) {
      console.error("calendar customers error:", customersRes.error);
      setCustomers([]);
    } else {
      setCustomers((customersRes.data || []) as CustomerRow[]);
    }

    if (staffsRes.error) {
      console.error("calendar staffs error:", staffsRes.error);
      setStaffs([]);
    } else {
      setStaffs((staffsRes.data || []) as StaffRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void fetchCalendarData();
  }, []);

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((customer) => {
      map.set(customer.id, customer.name || "顧客名未設定");
    });
    return map;
  }, [customers]);

  const staffMap = useMemo(() => {
    const map = new Map<string, string>();
    staffs.forEach((staff) => {
      map.set(staff.id, staff.name || "名前未設定");
    });
    return map;
  }, [staffs]);

  const calendarReservations = useMemo<CalendarReservation[]>(() => {
    return reservations
      .map((reservation) => {
        const date = toJstDateText(reservation.start_at);
        const startTime = toJstTimeText(reservation.start_at);
        const endTime = toJstTimeText(reservation.end_at);
        const startMinute = timeTextToMinute(startTime);
        const endMinute = timeTextToMinute(endTime);

        const staffId = reservation.staff_id || null;
        const staffName = staffId
          ? staffMap.get(staffId) || "未設定"
          : "指名なし";

        const customerName = reservation.customer_id
          ? customerMap.get(reservation.customer_id) || "顧客名未設定"
          : "顧客未設定";

        return {
          id: reservation.id,
          customerName,
          staffId,
          staffName,
          menuName: reservation.menu_name || reservation.menu || "未設定",
          status: normalizeStatus(reservation.status),
          source: reservation.source || "手入力",
          memo: reservation.memo || "",
          date,
          startTime,
          endTime,
          startMinute,
          endMinute,
          durationMinutes: Math.max(endMinute - startMinute, SLOT_MINUTES),
        };
      })
      .filter((reservation) => reservation.date === selectedDate);
  }, [reservations, selectedDate, customerMap, staffMap]);

  const staffColumns = useMemo(() => {
    const names = new Set<string>();

    staffs.forEach((staff) => {
      if (staff.name) names.add(staff.name);
    });

    calendarReservations.forEach((reservation) => {
      if (reservation.staffName) names.add(reservation.staffName);
    });

    const result = Array.from(names);

    return result.length > 0 ? result : ["未設定"];
  }, [staffs, calendarReservations]);

  const overlapIds = useMemo(() => {
    const ids = new Set<string>();

    calendarReservations.forEach((reservation) => {
      calendarReservations.forEach((other) => {
        if (hasOverlap(reservation, other)) {
          ids.add(reservation.id);
        }
      });
    });

    return ids;
  }, [calendarReservations]);

  const timeSlots = useMemo(() => buildTimeSlots(), []);

  const dayStartMinute = DAY_START_HOUR * 60;
  const rowHeight = 56;

  function getReservationsForStaff(staffName: string) {
    return calendarReservations.filter(
      (reservation) => reservation.staffName === staffName
    );
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div
        className="mx-auto w-full max-w-[1200px] space-y-4 p-4"
        style={{ paddingBottom: "100px" }}
      >
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold text-white">
                予約カレンダー
              </h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                スタッフ別・時間帯別に予約状況を確認できます。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/reservations"
                className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
              >
                一覧へ戻る
              </Link>

              <Link
                href="/reservations/new"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-rose-500 shadow"
              >
                新規予約
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">対象日</div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {formatDateLabel(selectedDate)}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedDate(addDaysText(selectedDate, -1))}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600"
              >
                前日
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
              />

              <button
                type="button"
                onClick={() => setSelectedDate(getTodayText())}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600"
              >
                今日
              </button>

              <button
                type="button"
                onClick={() => setSelectedDate(addDaysText(selectedDate, 1))}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600"
              >
                翌日
              </button>
            </div>
          </div>
        </section>

        {overlapIds.size > 0 ? (
          <section className="rounded-[28px] border border-rose-200 bg-rose-50 p-4 shadow-sm">
            <div className="text-sm font-bold text-rose-700">
              ダブルブッキング注意
            </div>
            <div className="mt-2 text-sm text-rose-700">
              同じ担当者で時間が重なっている予約があります。
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="text-sm font-bold text-emerald-700">
              重複は見つかっていません
            </div>
            <div className="mt-2 text-sm text-emerald-700">
              同じ担当者・同時間帯の重複は現在ありません。
            </div>
          </section>
        )}

        <section className="rounded-[28px] border border-rose-100 bg-white p-3 shadow-sm">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">読み込み中...</div>
          ) : (
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[860px]"
                style={{
                  gridTemplateColumns: `82px repeat(${staffColumns.length}, minmax(180px, 1fr))`,
                }}
              >
                <div className="sticky left-0 z-20 border-b border-r bg-white p-3 text-sm font-bold text-slate-600">
                  時間
                </div>

                {staffColumns.map((staffName) => (
                  <div
                    key={staffName}
                    className="border-b border-r bg-rose-50 p-3 text-center text-sm font-bold text-slate-900"
                  >
                    {staffName}
                  </div>
                ))}

                <div className="sticky left-0 z-10 border-r bg-white">
                  {timeSlots.map((slot) => (
                    <div
                      key={slot}
                      className="border-b px-2 py-2 text-xs font-bold text-slate-500"
                      style={{ height: rowHeight }}
                    >
                      {slot}
                    </div>
                  ))}
                </div>

                {staffColumns.map((staffName) => {
                  const staffReservations = getReservationsForStaff(staffName);

                  return (
                    <div
                      key={staffName}
                      className="relative border-r bg-white"
                      style={{ height: rowHeight * timeSlots.length }}
                    >
                      {timeSlots.map((slot) => (
                        <div
                          key={`${staffName}-${slot}`}
                          className="border-b border-slate-100"
                          style={{ height: rowHeight }}
                        />
                      ))}

                      {staffReservations.map((reservation) => {
                        const top =
                          ((reservation.startMinute - dayStartMinute) /
                            SLOT_MINUTES) *
                          rowHeight;

                        const height =
                          Math.max(
                            reservation.durationMinutes / SLOT_MINUTES,
                            1
                          ) * rowHeight;

                        const colorClass = getStatusColor(
                          reservation.status,
                          reservation.source
                        );

                        return (
                          <Link
                            key={reservation.id}
                            href={`/reservations/edit/${reservation.id}`}
                            className={`absolute left-2 right-2 overflow-hidden rounded-2xl border p-2 text-xs shadow-sm ${colorClass} ${
                              overlapIds.has(reservation.id)
                                ? "ring-2 ring-rose-400"
                                : ""
                            }`}
                            style={{
                              top: Math.max(top, 0),
                              height: Math.max(height - 6, 52),
                            }}
                          >
                            <div className="truncate font-black">
                              {reservation.customerName}
                            </div>

                            <div className="mt-1 truncate font-bold">
                              {reservation.startTime}〜{reservation.endTime}
                            </div>

                            <div className="mt-1 truncate">
                              {reservation.menuName}
                            </div>

                            <div className="mt-1 flex flex-wrap gap-1">
                              <span className="rounded-full bg-white/70 px-2 py-0.5">
                                {reservation.status}
                              </span>
                              <span className="rounded-full bg-white/70 px-2 py-0.5">
                                {reservation.source}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}