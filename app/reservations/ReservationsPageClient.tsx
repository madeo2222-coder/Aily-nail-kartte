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
  staff_id?: string | null;
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

type GalleryReference = {
  designId: string | null;
  photoUrl: string | null;
  menuName: string | null;
  color: string | null;
};

type NormalizedReservation = {
  isAiDiagnosis: boolean;
  galleryReference: GalleryReference;
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

function pickString(row: ReservationRow, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function pickNullableString(row: ReservationRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function pickNumber(row: ReservationRow, keys: string[], fallback = 0): number {
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

  if (Number.isNaN(date.getTime())) {
    return null;
  }

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

function formatDateLabel(value: string | null) {
  if (!value) return "未設定";
  const normalized = value.slice(0, 10);
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return normalized;
  return `${year}/${Number(month)}/${Number(day)}`;
}

function formatTimeRange(startTime: string | null, durationMinutes: number) {
  if (!startTime) return "未設定";

  const [hourText, minuteText] = startTime.split(":").map(Number);
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
  if (status === "予約申請中" || status === "予約受付" || status === "予約") {
    return "bg-amber-100 text-amber-700";
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

  if (raw === "requested") return "予約申請中";
  if (raw === "confirmed") return "予約確定";
  if (raw === "completed") return "完了";
  if (raw === "cancelled") return "キャンセル";
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
  const normalizedStartAt = normalizeSupabaseDateTime(startAt);
  const normalizedEndAt = normalizeSupabaseDateTime(endAt);

  if (!normalizedStartAt || !normalizedEndAt) return null;

  const start = new Date(normalizedStartAt);
  const end = new Date(normalizedEndAt);

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

  return 90;
}

function extractLineValue(memo: string, label: string) {
  const line = memo
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith(label));

  if (!line) return null;

  const value = line.replace(label, "").trim();

  return value || null;
}

function extractGalleryReference(memo: string): GalleryReference {
  if (!memo.includes("Aily Gallery参考デザインあり")) {
    return {
      designId: null,
      photoUrl: null,
      menuName: null,
      color: null,
    };
  }

  return {
    designId: extractLineValue(memo, "参考デザインID："),
    photoUrl: extractLineValue(memo, "参考写真URL："),
    menuName: extractLineValue(memo, "参考メニュー："),
    color: extractLineValue(memo, "参考カラー："),
  };
}

function buildDisplayMemo(memo: string) {
  if (!memo) return "なし";

  return memo
    .split("\n")
    .filter((line) => !line.startsWith("参考写真URL："))
    .join("\n")
    .trim();
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

function canConfirmReservation(status: string) {
  return status === "予約申請中" || status === "予約受付" || status === "予約";
}

function canMarkVisited(status: string) {
  return (
    status === "予約確定" ||
    status === "confirmed" ||
    status === "予約申請中" ||
    status === "予約受付" ||
    status === "予約"
  );
}

export default function ReservationsPageClient() {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("全員");
  const [showPendingOnly, setShowPendingOnly] = useState(false);

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
        typeof reservation.staff_id === "string" ? reservation.staff_id : null;

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

      const memo = normalizeMemo(reservation);
      const galleryReference = extractGalleryReference(memo);

      return {
        id: reservation.id,
        isAiDiagnosis:
          normalizeMenuName(reservation) === "開運ネイル相談" ||
          memo.includes("AI算命学診断経由"),
        galleryReference,
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
        memo,
        createdAt:
          typeof reservation.created_at === "string"
            ? reservation.created_at
            : null,
      };
    });
  }, [reservations, customerMap, staffMap]);

  useEffect(() => {
    if (selectedDate) return;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  }, [selectedDate]);

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
      const staffMatch =
        selectedStaff === "全員" || row.staffName === selectedStaff;
      return dateMatch && staffMatch;
    });
  }, [normalizedReservations, selectedDate, selectedStaff]);

  const pendingReservations = useMemo(() => {
    return normalizedReservations
      .filter(
        (item) =>
          item.status === "予約申請中" ||
          item.status === "予約受付" ||
          item.status === "予約"
      )
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [normalizedReservations]);

  const displayedReservations = useMemo(() => {
    return showPendingOnly ? pendingReservations : filteredReservations;
  }, [showPendingOnly, pendingReservations, filteredReservations]);

  const overlapIds = useMemo(() => {
    const ids = new Set<string>();

    displayedReservations.forEach((currentItem) => {
      displayedReservations.forEach((otherItem) => {
        if (hasOverlap(currentItem, otherItem)) {
          ids.add(currentItem.id);
        }
      });
    });

    return ids;
  }, [displayedReservations]);

  const overlapReservations = useMemo(() => {
    return displayedReservations.filter((item) => overlapIds.has(item.id));
  }, [displayedReservations, overlapIds]);

  const reservationCount = filteredReservations.length;

  const requestedCount = pendingReservations.length;

  const aiDiagnosisCount = filteredReservations.filter(
    (item) => item.isAiDiagnosis
  ).length;

  const galleryReferenceCount = filteredReservations.filter(
    (item) => item.galleryReference.designId || item.galleryReference.photoUrl
  ).length;

  async function sendReservationConfirmedLine(id: string) {
    try {
      const response = await fetch("/api/send-reservation-confirmed-line", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reservationId: id,
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        sent?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        console.error("予約確定LINE通知エラー:", result);
        alert(
          "予約は確定しましたが、LINE通知に失敗しました。LINE_CHANNEL_ACCESS_TOKENやline_user_idを確認してください。"
        );
        return;
      }

      if (result.sent === false) {
        alert(
          result.message ||
            "予約は確定しましたが、顧客のLINE連携が未登録のためLINE通知は送信していません。"
        );
        return;
      }

      alert("予約を確定し、LINE通知を送信しました。");
    } catch (error) {
      console.error("予約確定LINE通知APIエラー:", error);
      alert("予約は確定しましたが、LINE通知処理でエラーが発生しました。");
    }
  }

  async function updateStatus(
    id: string,
    status: string,
    options?: {
      sendConfirmedLine?: boolean;
    }
  ) {
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

    if (options?.sendConfirmedLine) {
      await sendReservationConfirmedLine(id);
    }

    await fetchReservations();
  }

  async function handleConfirmReservation(id: string) {
    const ok = window.confirm(
      "この予約を『予約確定』に変更し、LINE通知を送信しますか？"
    );
    if (!ok) return;

    await updateStatus(id, "confirmed", {
      sendConfirmedLine: true,
    });
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
      <main className="min-h-screen bg-rose-50/40">
        <div
          className="mx-auto w-full max-w-[920px] p-4"
          style={{ paddingBottom: "100px" }}
        >
          <div className="rounded-3xl border border-rose-100 bg-white p-4 text-sm text-gray-500 shadow-sm">
            読み込み中...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div
        className="mx-auto w-full max-w-[920px] space-y-4 p-4"
        style={{ paddingBottom: "100px" }}
        suppressHydrationWarning
      >
        <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold text-white">予約ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                ご予約の確認・確定・LINE通知・来店変更・重複チェックをまとめたページです。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/staff"
                className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
              >
                スタッフページへ
              </Link>

              <Link
                href="/reservations/calendar"
                className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
              >
                カレンダー表示
              </Link>

              <Link
                href="/reservations/new"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-rose-500 shadow"
              >
                新規予約
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">本日予約</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {reservationCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-slate-500">
              選択中条件の予約件数
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPendingOnly(true)}
            className={`rounded-3xl border p-4 text-left shadow-sm transition ${
              requestedCount > 0
                ? "border-amber-300 bg-amber-50 ring-2 ring-amber-100"
                : "border-amber-100 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-slate-700">
                未確認予約（全日程）
              </div>
              {requestedCount > 0 ? (
                <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black text-white">
                  要対応
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-500">
              {requestedCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-slate-500">
              日付に関係なく、未確定の予約希望を表示
            </div>
          </button>

          <div className="rounded-3xl border border-purple-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">AI診断予約</div>
            <div className="mt-2 text-2xl font-bold text-purple-600">
              {aiDiagnosisCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-slate-500">算命学診断経由</div>
          </div>

          <div className="rounded-3xl border border-pink-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">Gallery予約</div>
            <div className="mt-2 text-2xl font-bold text-pink-600">
              {galleryReferenceCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-slate-500">参考デザインあり</div>
          </div>
        </div>

        {requestedCount > 0 ? (
          <section className="rounded-[28px] border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-black text-amber-900">
                  未確認の予約希望が{requestedCount}件あります
                </div>
                <div className="mt-1 text-sm leading-6 text-amber-800">
                  予約日が先でもここに表示されます。内容を確認して、予約確定・LINE送信まで対応してください。
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPendingOnly(true)}
                className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-white shadow-sm"
              >
                未確認予約を確認する
              </button>
            </div>
          </section>
        ) : null}

        {showPendingOnly ? (
          <section className="rounded-[28px] border border-amber-300 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-black text-slate-900">
                  未確認予約を全日程で表示中
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  対象日・担当者の絞り込みに関係なく、未確定の予約希望だけを表示しています。
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPendingOnly(false)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
              >
                通常表示に戻る
              </button>
            </div>
          </section>
        ) : null}

        <div className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <div className="text-sm font-bold text-slate-900">絞り込み</div>
            <div className="mt-1 text-xs text-slate-500">
              日付と担当者を選んで、見たい予約だけ確認できます。
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
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
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
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
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
          <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-4 shadow-sm">
            <div className="text-sm font-bold text-rose-700">
              ダブルブッキングにご注意ください
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
          <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="text-sm font-bold text-emerald-700">
              重複は見つかっていません
            </div>
            <div className="mt-2 text-sm text-emerald-700">
              同じ担当者・同時間帯の重複は現在ありません。
            </div>
          </div>
        )}

        {displayedReservations.length === 0 ? (
          <div className="rounded-[28px] border border-rose-100 bg-white p-5 text-center text-sm text-gray-500 shadow-sm">
            {showPendingOnly
              ? "未確認の予約希望はありません"
              : "条件に合う予約はありません"}
          </div>
        ) : (
          <div className="space-y-3">
            {displayedReservations.map((item) => {
              const isUpdating = updatingId === item.id;
              const isOverlap = overlapIds.has(item.id);
              const galleryReference = item.galleryReference;
              const displayMemo = buildDisplayMemo(item.memo);

              return (
                <div
                  key={item.id}
                  className={`rounded-[28px] border p-4 shadow-sm ${
                    isOverlap
                      ? "border-rose-300 bg-rose-50"
                      : "border-rose-100 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
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

                        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                          {item.source || "手入力"}
                        </span>

                        {item.isAiDiagnosis ? (
                          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                            ✨ AI診断
                          </span>
                        ) : null}

                        {galleryReference.designId ||
                        galleryReference.photoUrl ? (
                          <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-bold text-pink-700">
                            💅 Gallery
                          </span>
                        ) : null}

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
                          {formatTimeRange(
                            item.reservationTime,
                            item.durationMinutes
                          )}
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

                        {galleryReference.designId ||
                        galleryReference.photoUrl ? (
                          <div className="rounded-3xl border border-pink-100 bg-pink-50 p-3">
                            <div className="text-sm font-bold text-pink-700">
                              Aily Gallery参考デザイン
                            </div>

                            {galleryReference.photoUrl ? (
                              <a
                                href={galleryReference.photoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 block overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-sm"
                              >
                                <img
                                  src={galleryReference.photoUrl}
                                  alt="Aily Gallery参考デザイン"
                                  className="h-56 w-full object-cover"
                                />
                              </a>
                            ) : (
                              <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs text-slate-500">
                                参考写真URLは保存されていません。
                              </div>
                            )}

                            <div className="mt-3 grid gap-1 text-xs leading-5 text-pink-800">
                              {galleryReference.designId ? (
                                <div>
                                  <span className="font-bold">
                                    参考デザインID：
                                  </span>
                                  {galleryReference.designId}
                                </div>
                              ) : null}

                              {galleryReference.menuName ? (
                                <div>
                                  <span className="font-bold">
                                    参考メニュー：
                                  </span>
                                  {galleryReference.menuName}
                                </div>
                              ) : null}

                              {galleryReference.color ? (
                                <div>
                                  <span className="font-bold">参考カラー：</span>
                                  {galleryReference.color}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <span className="font-medium">メモ:</span>{" "}
                          <span className="whitespace-pre-wrap">
                            {displayMemo || "なし"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/reservations/edit/${item.id}`}
                        className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600"
                      >
                        編集
                      </Link>

                      {canConfirmReservation(item.status) ? (
                        <button
                          type="button"
                          onClick={() => handleConfirmReservation(item.id)}
                          disabled={isUpdating}
                          className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                          suppressHydrationWarning
                        >
                          {isUpdating ? "更新中..." : "予約確定・LINE送信"}
                        </button>
                      ) : null}

                      {canMarkVisited(item.status) ? (
                        <button
                          type="button"
                          onClick={() => handleMarkVisited(item.id)}
                          disabled={isUpdating}
                          className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600 disabled:opacity-50"
                          suppressHydrationWarning
                        >
                          {isUpdating ? "更新中..." : "来店にする"}
                        </button>
                      ) : null}

                      {(item.status === "来店予定" || item.status === "来店") && (
                        <button
                          type="button"
                          onClick={() => handleMarkCompleted(item.id)}
                          disabled={isUpdating}
                          className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600 disabled:opacity-50"
                          suppressHydrationWarning
                        >
                          {isUpdating ? "更新中..." : "完了にする"}
                        </button>
                      )}

                      <Link
                        href={buildVisitLink(item)}
                        className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
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