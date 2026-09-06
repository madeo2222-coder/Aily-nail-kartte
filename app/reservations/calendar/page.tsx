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

type ExternalCalendarBlockRow = {
  id: string;
  salon_id: string | null;
  staff_id: string | null;
  source: string | null;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  memo: string | null;
  created_at: string | null;
};

type VisitRow = {
  customer_id: string | null;
  visit_date: string | null;
  menu_name: string | null;
  menu: string | null;
  memo: string | null;
  next_proposal: string | null;
};

type CustomerIntakeRow = {
  customer_id: string | null;
  allergy: string | null;
  skin_trouble: string | null;
  constitution: string | null;
  avoid_items: string | null;
  submitted_at: string | null;
  created_at: string | null;
};

type CustomerBrief = {
  allergy: string;
  caution: string;
  previousMemo: string;
  previousMenu: string;
  nextProposal: string;
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
  customerId: string | null;
  customerName: string;
  visitCount: number;
  allergy: string;
  caution: string;
  previousMemo: string;
  previousMenu: string;
  nextProposal: string;
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
  isExternalBlock: boolean;
};

type StaffColumn = {
  key: string;
  staffId: string | null;
  staffName: string;
};

type MonthDay = {
  dateText: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

const DAY_START_HOUR = 10;
const DAY_END_HOUR = 19;
const SLOT_MINUTES = 30;

function getTodayText() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthText(dateText: string) {
  return dateText.slice(0, 7);
}

function parseSupabaseTimestampAsUtc(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const normalized = trimmed.replace(" ", "T");
  const date = new Date(`${normalized}Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getJstParts(value: string | null) {
  const date = parseSupabaseTimestampAsUtc(value);
  if (!date) return null;

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

function toLocalDateText(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function toLocalTimeText(value: string | null) {
  if (!value) return "";
  return value.slice(11, 16);
}

function timeTextToMinute(time: string) {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function getContractorStaffName(memo: string | null) {
  const matched = memo?.match(/(?:^|\n)施術スタッフ[：:]\s*(.+)/);
  return matched?.[1]?.trim() || "";
}

function addDaysText(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function addMonthsText(monthText: string, months: number) {
  const date = new Date(`${monthText}-01T00:00:00+09:00`);
  date.setMonth(date.getMonth() + months);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");

  return `${yyyy}-${mm}`;
}

function formatDateLabel(dateText: string) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return dateText;

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}（${
    weekdays[date.getDay()]
  }）`;
}

function formatMonthLabel(monthText: string) {
  const [year, month] = monthText.split("-");
  return `${year}年${Number(month)}月`;
}

function normalizeStatus(status: string | null) {
  if (status === "requested") return "予約申請中";
  if (status === "confirmed") return "予約確定";
  if (status === "completed") return "完了";
  if (status === "cancelled") return "キャンセル";
  if (status === "予約") return "予約受付";
  return status || "予約申請中";
}

function isCancelledStatus(status: string) {
  return status === "キャンセル" || status === "cancelled";
}

function normalizeBriefText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function isMeaninglessBrief(value: string) {
  const text = value
    .replace(/[　\s]/g, "")
    .replace(/[。、]/g, "")
    .toLowerCase();

  return (
    text === "" ||
    text === "-" ||
    text === "ー" ||
    text === "なし" ||
    text === "無し".toLowerCase() ||
    text === "特になし" ||
    text === "特に無し".toLowerCase() ||
    text === "未登録" ||
    text === "null"
  );
}

function joinBriefParts(values: Array<string | null | undefined>) {
  const unique = new Set<string>();

  values.forEach((value) => {
    const text = normalizeBriefText(value);

    if (isMeaninglessBrief(text)) {
      return;
    }

    unique.add(text);
  });

  return [...unique].join(" / ");
}

function getVisitMenu(visit: VisitRow | undefined) {
  if (!visit) return "";
  return normalizeBriefText(visit.menu_name || visit.menu);
}

function normalizeSourceLabel(params: {
  source: string;
  memo: string;
  menuName: string;
  isExternalBlock: boolean;
}) {
  const source = params.source.trim().toLowerCase();
  const checkText = `${params.source} ${params.memo} ${params.menuName}`;

  if (
    source.includes("hpb") ||
    source.includes("hotpepper") ||
    source.includes("hot pepper") ||
    checkText.includes("HPB予約番号") ||
    checkText.includes("ホットペッパー")
  ) {
    return "HPB同期";
  }

  if (
    source.includes("minimo") ||
    source.includes("ミニモ") ||
    checkText.includes("ミニモ予約ID") ||
    checkText.includes("ミニモ")
  ) {
    return "ミニモ同期";
  }

  if (
    source.includes("line") ||
    source.includes("ライン") ||
    checkText.includes("LINE") ||
    checkText.includes("ライン")
  ) {
    return "LINE予約";
  }

  if (
    source.includes("instagram") ||
    source.includes("インスタ") ||
    checkText.includes("Instagram") ||
    checkText.includes("インスタ")
  ) {
    return "Instagram";
  }

  if (
    source.includes("phone") ||
    source.includes("電話") ||
    checkText.includes("電話")
  ) {
    return "電話予約";
  }

  if (
    params.isExternalBlock ||
    source.includes("external") ||
    source.includes("外部") ||
    checkText.includes("外部ブロック") ||
    checkText.includes("休憩") ||
    checkText.includes("店休日") ||
    checkText.includes("ブロック")
  ) {
    return "外部ブロック";
  }

  if (
    source.includes("naily") ||
    source.includes("customer-app") ||
    source.includes("customer_app") ||
    source.includes("顧客アプリ")
  ) {
    return "Naily予約";
  }

  return params.source || "手入力";
}

function getSourceBadgeClass(sourceLabel: string) {
  if (sourceLabel === "HPB同期") {
    return "bg-orange-100 text-orange-700";
  }

  if (sourceLabel === "ミニモ同期") {
    return "bg-purple-100 text-purple-700";
  }

  if (sourceLabel === "LINE予約") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (sourceLabel === "Instagram") {
    return "bg-pink-100 text-pink-700";
  }

  if (sourceLabel === "電話予約") {
    return "bg-slate-200 text-slate-700";
  }

  if (sourceLabel === "外部ブロック") {
    return "bg-zinc-200 text-zinc-700";
  }

  if (sourceLabel === "Naily予約") {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-white/70 text-slate-700";
}

function getStatusColor(status: string, sourceLabel: string) {
  if (isCancelledStatus(status)) {
    return "border-zinc-300 bg-zinc-100 text-zinc-500 opacity-60";
  }

  if (sourceLabel === "HPB同期") {
    return "border-orange-200 bg-orange-100 text-orange-800";
  }

  if (sourceLabel === "ミニモ同期") {
    return "border-purple-200 bg-purple-100 text-purple-800";
  }

  if (sourceLabel === "LINE予約") {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }

  if (sourceLabel === "Instagram") {
    return "border-pink-200 bg-pink-100 text-pink-800";
  }

  if (sourceLabel === "電話予約") {
    return "border-slate-300 bg-slate-100 text-slate-800";
  }

  if (sourceLabel === "外部ブロック") {
    return "border-zinc-300 bg-zinc-100 text-zinc-800";
  }

  if (sourceLabel === "Naily予約") {
    return "border-blue-200 bg-blue-100 text-blue-800";
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
  if (a.staffId !== b.staffId) return false;
  if (isCancelledStatus(a.status) || isCancelledStatus(b.status)) return false;

  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

function buildMonthDays(monthText: string) {
  const [yearText, monthOnlyText] = monthText.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthOnlyText) - 1;

  const firstDate = new Date(year, monthIndex, 1);
  const startDate = new Date(firstDate);
  startDate.setDate(firstDate.getDate() - firstDate.getDay());

  const todayText = getTodayText();
  const days: MonthDay[] = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateText = `${yyyy}-${mm}-${dd}`;

    days.push({
      dateText,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === monthIndex,
      isToday: dateText === todayText,
    });
  }

  return days;
}

export default function ReservationsCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(getTodayText());
  const [selectedMonth, setSelectedMonth] = useState(
    getMonthText(getTodayText()),
  );
  const [selectedStaffFilter, setSelectedStaffFilter] = useState("all");

  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [externalBlocks, setExternalBlocks] = useState<
    ExternalCalendarBlockRow[]
  >([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [customerIntakes, setCustomerIntakes] = useState<CustomerIntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingHpb, setSyncingHpb] = useState(false);

  async function fetchCalendarData() {
    setLoading(true);

    const [
      reservationsRes,
      externalBlocksRes,
      customersRes,
      staffsRes,
      visitsRes,
      customerIntakesRes,
    ] = await Promise.all([
      supabase
        .from("reservations")
        .select("*")
        .order("start_at", { ascending: true }),
      supabase
        .from("external_calendar_blocks")
        .select("*")
        .order("start_at", { ascending: true }),
      supabase.from("customers").select("id, name"),
      supabase
        .from("staffs")
        .select("id, name")
        .eq("role", "staff")
        .eq("is_active", true),
      supabase
        .from("visits")
        .select("customer_id, visit_date, menu_name, menu, memo, next_proposal")
        .order("visit_date", { ascending: false }),
      supabase
        .from("customer_intakes")
        .select(
          "customer_id, allergy, skin_trouble, constitution, avoid_items, submitted_at, created_at",
        )
        .order("created_at", { ascending: false }),
    ]);

    if (reservationsRes.error) {
      console.error("calendar reservations error:", reservationsRes.error);
      setReservations([]);
    } else {
      setReservations((reservationsRes.data || []) as ReservationRow[]);
    }

    if (externalBlocksRes.error) {
      console.error("calendar external blocks error:", externalBlocksRes.error);
      setExternalBlocks([]);
    } else {
      setExternalBlocks(
        (externalBlocksRes.data || []) as ExternalCalendarBlockRow[],
      );
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

    if (visitsRes.error) {
      console.error("calendar visits error:", visitsRes.error);
      setVisits([]);
    } else {
      setVisits((visitsRes.data || []) as VisitRow[]);
    }

    if (customerIntakesRes.error) {
      console.error(
        "calendar customer_intakes error:",
        customerIntakesRes.error,
      );
      setCustomerIntakes([]);
    } else {
      setCustomerIntakes(
        (customerIntakesRes.data || []) as CustomerIntakeRow[],
      );
    }

    setLoading(false);
  }

  async function syncHpbNow() {
    try {
      setSyncingHpb(true);

      const response = await fetch("/api/hpb-gmail-sync", {
        method: "POST",
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "同期に失敗しました");
      }

      await fetchCalendarData();

      alert(`${json.count ?? 0}件同期しました`);
    } catch (error) {
      console.error(error);

      alert(error instanceof Error ? error.message : "同期に失敗しました");
    } finally {
      setSyncingHpb(false);
    }
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

  const visitCountMap = useMemo(() => {
    const map = new Map<string, number>();

    visits.forEach((visit) => {
      if (!visit.customer_id) return;

      map.set(visit.customer_id, (map.get(visit.customer_id) || 0) + 1);
    });

    return map;
  }, [visits]);

  const customerBriefMap = useMemo(() => {
    const latestVisitMap = new Map<string, VisitRow>();
    const latestIntakeMap = new Map<string, CustomerIntakeRow>();

    visits.forEach((visit) => {
      if (!visit.customer_id || latestVisitMap.has(visit.customer_id)) return;
      latestVisitMap.set(visit.customer_id, visit);
    });

    customerIntakes.forEach((intake) => {
      if (!intake.customer_id || latestIntakeMap.has(intake.customer_id)) return;
      latestIntakeMap.set(intake.customer_id, intake);
    });

    const map = new Map<string, CustomerBrief>();

    customers.forEach((customer) => {
      const latestVisit = latestVisitMap.get(customer.id);
      const latestIntake = latestIntakeMap.get(customer.id);

      map.set(customer.id, {
        allergy: normalizeBriefText(latestIntake?.allergy),
        caution: joinBriefParts([
          latestIntake?.skin_trouble,
          latestIntake?.constitution,
          latestIntake?.avoid_items,
        ]),
        previousMemo: normalizeBriefText(latestVisit?.memo),
        previousMenu: getVisitMenu(latestVisit),
        nextProposal: normalizeBriefText(latestVisit?.next_proposal),
      });
    });

    return map;
  }, [customers, customerIntakes, visits]);

  const reservationCalendarRows = useMemo<CalendarReservation[]>(() => {
    return reservations.map((reservation) => {
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

      const customerId = reservation.customer_id || null;
      const visitCount = customerId ? visitCountMap.get(customerId) || 0 : 0;
      const brief = customerId ? customerBriefMap.get(customerId) : undefined;

      return {
        id: reservation.id,
        customerId,
        customerName,
        visitCount,
        allergy: brief?.allergy || "",
        caution: brief?.caution || "",
        previousMemo: brief?.previousMemo || "",
        previousMenu: brief?.previousMenu || "",
        nextProposal: brief?.nextProposal || "",
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
        isExternalBlock: false,
      };
    });
  }, [
    reservations,
    customerMap,
    staffMap,
    visitCountMap,
    customerBriefMap,
  ]);

  const externalCalendarRows = useMemo<CalendarReservation[]>(() => {
    return externalBlocks.map((block) => {
      const date = toLocalDateText(block.start_at);
      const startTime = toLocalTimeText(block.start_at);
      const endTime = toLocalTimeText(block.end_at);
      const startMinute = timeTextToMinute(startTime);
      const endMinute = timeTextToMinute(endTime);

      const staffId = block.staff_id || null;
      const staffName = staffId
        ? staffMap.get(staffId) || "未設定"
        : "指名なし";
      const source = block.source || "外部";
      const title = block.title || `${source}予約`;
      const isContractorBooking =
        staffName === "業務委託" || source === "業務委託";
      const contractorStaffName = getContractorStaffName(block.memo);

      return {
        id: `external-${block.id}`,
        customerId: null,
        customerName: isContractorBooking ? title : source,
        visitCount: 0,
        allergy: "",
        caution: "",
        previousMemo: "",
        previousMenu: "",
        nextProposal: "",
        staffId,
        staffName,
        menuName: isContractorBooking
          ? `施術：${contractorStaffName || "スタッフ名未入力"}`
          : title,
        status: "外部ブロック",
        source: isContractorBooking ? "業務委託" : source,
        memo: [source, title, block.memo || "", "外部ブロック"]
          .filter(Boolean)
          .join(" "),
        date,
        startTime,
        endTime,
        startMinute,
        endMinute,
        durationMinutes: Math.max(endMinute - startMinute, SLOT_MINUTES),
        isExternalBlock: true,
      };
    });
  }, [externalBlocks, staffMap]);

  const allCalendarReservations = useMemo<CalendarReservation[]>(() => {
    return [...reservationCalendarRows, ...externalCalendarRows];
  }, [reservationCalendarRows, externalCalendarRows]);

  const staffFilteredReservations = useMemo(() => {
    if (selectedStaffFilter === "all") {
      return allCalendarReservations;
    }

    if (selectedStaffFilter === "no_staff") {
      return allCalendarReservations.filter(
        (reservation) => reservation.staffId === null,
      );
    }

    return allCalendarReservations.filter(
      (reservation) => reservation.staffId === selectedStaffFilter,
    );
  }, [allCalendarReservations, selectedStaffFilter]);

  const calendarReservations = useMemo<CalendarReservation[]>(() => {
    return staffFilteredReservations.filter(
      (reservation) => reservation.date === selectedDate,
    );
  }, [staffFilteredReservations, selectedDate]);

  const reservationCountByDate = useMemo(() => {
    const map = new Map<string, number>();

    staffFilteredReservations.forEach((reservation) => {
      if (!reservation.date) return;
      if (isCancelledStatus(reservation.status)) return;

      map.set(reservation.date, (map.get(reservation.date) || 0) + 1);
    });

    return map;
  }, [staffFilteredReservations]);

  const monthDays = useMemo(() => {
    return buildMonthDays(selectedMonth);
  }, [selectedMonth]);

  const staffColumns = useMemo<StaffColumn[]>(() => {
    if (selectedStaffFilter === "no_staff") {
      return [
        {
          key: "no_staff",
          staffId: null,
          staffName: "指名なし",
        },
      ];
    }

    if (selectedStaffFilter !== "all") {
      const staff = staffs.find((item) => item.id === selectedStaffFilter);

      return [
        {
          key: selectedStaffFilter,
          staffId: selectedStaffFilter,
          staffName: staff?.name || "名前未設定",
        },
      ];
    }

    const columns: StaffColumn[] = staffs.map((staff) => ({
      key: staff.id,
      staffId: staff.id,
      staffName: staff.name || "名前未設定",
    }));

    const hasNoStaffReservation = calendarReservations.some(
      (reservation) => reservation.staffId === null,
    );

    if (hasNoStaffReservation) {
      columns.push({
        key: "no_staff",
        staffId: null,
        staffName: "指名なし",
      });
    }

    return columns.length > 0
      ? columns
      : [
          {
            key: "no_staff",
            staffId: null,
            staffName: "指名なし",
          },
        ];
  }, [staffs, selectedStaffFilter, calendarReservations]);

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

  function selectDate(dateText: string) {
    setSelectedDate(dateText);
    setSelectedMonth(getMonthText(dateText));
  }

  function moveMonth(months: number) {
    const nextMonth = addMonthsText(selectedMonth, months);
    setSelectedMonth(nextMonth);

    const currentDay = selectedDate.slice(8, 10);
    const nextCandidate = `${nextMonth}-${currentDay}`;
    const candidateDate = new Date(`${nextCandidate}T00:00:00+09:00`);

    if (
      Number.isNaN(candidateDate.getTime()) ||
      getMonthText(nextCandidate) !== nextMonth
    ) {
      setSelectedDate(`${nextMonth}-01`);
      return;
    }

    setSelectedDate(nextCandidate);
  }

  function goToday() {
    const today = getTodayText();
    setSelectedDate(today);
    setSelectedMonth(getMonthText(today));
  }

  function getReservationsForStaff(column: StaffColumn) {
    return calendarReservations.filter(
      (reservation) => reservation.staffId === column.staffId,
    );
  }

  const selectedStaffLabel = useMemo(() => {
    if (selectedStaffFilter === "all") return "全スタッフ";
    if (selectedStaffFilter === "no_staff") return "指名なし";

    const staff = staffs.find((item) => item.id === selectedStaffFilter);
    return staff?.name || "名前未設定";
  }, [selectedStaffFilter, staffs]);

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div
        className="mx-auto w-full max-w-[1200px] space-y-4 p-4"
        style={{ paddingBottom: "100px" }}
      >
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>

              <h1 className="mt-2 text-2xl font-bold text-white">
                予約カレンダー
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-white/90">
                HPB・ミニモ・Naily・電話予約・外部ブロックを、予約元ごとの色で確認できます。
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 lg:w-auto lg:min-w-[430px]">
              <button
                type="button"
                onClick={syncHpbNow}
                disabled={syncingHpb}
                className="col-span-2 inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-orange-600 shadow disabled:opacity-60"
              >
                {syncingHpb ? "予約同期中..." : "予約今すぐ同期"}
              </button>

              <Link
                href="/external-calendar-blocks"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/40 bg-white/80 px-3 py-3 text-center text-sm font-bold text-rose-600 backdrop-blur"
              >
                外部予約ブロック
              </Link>

              <Link
                href="/reservations/new"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-3 py-3 text-center text-sm font-bold text-rose-500 shadow"
              >
                新規予約
              </Link>

              <Link
                href="/reservations"
                className="col-span-2 inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/40 bg-white/80 px-3 py-3 text-center text-sm font-bold text-rose-600 backdrop-blur"
              >
                予約一覧へ
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="text-sm font-bold text-slate-900">予約元の色分け</div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full border border-orange-200 bg-orange-100 px-3 py-1.5 text-orange-700">
              HPB
            </span>
            <span className="rounded-full border border-purple-200 bg-purple-100 px-3 py-1.5 text-purple-700">
              ミニモ
            </span>
            <span className="rounded-full border border-blue-200 bg-blue-100 px-3 py-1.5 text-blue-700">
              Naily
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1.5 text-emerald-700">
              LINE
            </span>
            <span className="rounded-full border border-pink-200 bg-pink-100 px-3 py-1.5 text-pink-700">
              Instagram
            </span>
            <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-slate-700">
              電話
            </span>
            <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-zinc-700">
              外部ブロック
            </span>
            <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-zinc-500 line-through">
              キャンセル
            </span>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-lg font-black text-rose-500"
            >
              ‹
            </button>

            <div className="text-center">
              <div className="text-sm font-bold text-slate-500">月表示</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {formatMonthLabel(selectedMonth)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-lg font-black text-rose-500"
            >
              ›
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center">
            {["日", "月", "火", "水", "木", "金", "土"].map((week) => (
              <div
                key={week}
                className={`py-2 text-xs font-bold ${
                  week === "日"
                    ? "text-rose-500"
                    : week === "土"
                      ? "text-blue-500"
                      : "text-slate-500"
                }`}
              >
                {week}
              </div>
            ))}

            {monthDays.map((day) => {
              const count = reservationCountByDate.get(day.dateText) || 0;
              const isSelected = day.dateText === selectedDate;

              return (
                <button
                  key={day.dateText}
                  type="button"
                  onClick={() => selectDate(day.dateText)}
                  className={`relative min-h-[64px] rounded-2xl border p-2 text-left transition ${
                    isSelected
                      ? "border-rose-400 bg-rose-100 shadow-sm"
                      : day.isToday
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-100 bg-white hover:bg-rose-50"
                  } ${day.isCurrentMonth ? "" : "opacity-35"}`}
                >
                  <div
                    className={`text-base font-black ${
                      isSelected
                        ? "text-rose-700"
                        : day.isToday
                          ? "text-blue-700"
                          : "text-slate-800"
                    }`}
                  >
                    {day.day}
                  </div>

                  {count > 0 ? (
                    <div className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-black text-white shadow">
                      {count > 9 ? "9+" : count}
                    </div>
                  ) : null}

                  {count > 0 ? (
                    <div className="mt-2 text-[10px] font-bold text-rose-500">
                      {count}件
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-bold text-slate-700">
              選択日：{formatDateLabel(selectedDate)}
            </div>

            <button
              type="button"
              onClick={goToday}
              className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600"
            >
              今日へ戻る
            </button>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_280px] md:items-end">
            <div>
              <div className="text-sm font-bold text-slate-900">対象日</div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {formatDateLabel(selectedDate)}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                表示：{selectedStaffLabel} / 予約件数：
                {calendarReservations.length}件
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                スタッフ表示
              </label>
              <select
                value={selectedStaffFilter}
                onChange={(e) => setSelectedStaffFilter(e.target.value)}
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm font-bold text-slate-700"
              >
                <option value="all">全スタッフ</option>
                <option value="no_staff">指名なし</option>
                {staffs.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name || "名前未設定"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectDate(addDaysText(selectedDate, -1))}
              className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600"
            >
              前日
            </button>

            <button
              type="button"
              onClick={goToday}
              className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600"
            >
              今日
            </button>

            <button
              type="button"
              onClick={() => selectDate(addDaysText(selectedDate, 1))}
              className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600"
            >
              翌日
            </button>
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

                {staffColumns.map((column) => (
                  <div
                    key={column.key}
                    className="border-b border-r bg-rose-50 p-3 text-center text-sm font-bold text-slate-900"
                  >
                    {column.staffName}
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

                {staffColumns.map((column) => {
                  const staffReservations = getReservationsForStaff(column);

                  return (
                    <div
                      key={column.key}
                      className="relative border-r bg-white"
                      style={{ height: rowHeight * timeSlots.length }}
                    >
                      {timeSlots.map((slot) => (
                        <div
                          key={`${column.key}-${slot}`}
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
                            1,
                          ) * rowHeight;

                        const sourceLabel = normalizeSourceLabel({
                          source: reservation.source,
                          memo: reservation.memo,
                          menuName: reservation.menuName,
                          isExternalBlock: reservation.isExternalBlock,
                        });

                        const colorClass = getStatusColor(
                          reservation.status,
                          sourceLabel,
                        );

                        const cardContent = (
                          <>
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
                              <span
                                className={`rounded-full px-2 py-0.5 ${
                                  isCancelledStatus(reservation.status)
                                    ? "bg-zinc-700 text-white"
                                    : "bg-white/70"
                                }`}
                              >
                                {isCancelledStatus(reservation.status)
                                  ? "キャンセル済み"
                                  : reservation.status}
                              </span>

                              <span
                                className={`rounded-full px-2 py-0.5 ${getSourceBadgeClass(
                                  sourceLabel,
                                )}`}
                              >
                                {sourceLabel}
                              </span>

                              {!reservation.isExternalBlock &&
                              !isCancelledStatus(reservation.status) ? (
                                <span
                                  className={`rounded-full px-2 py-0.5 font-bold ${
                                    !reservation.customerId
                                      ? "bg-slate-700 text-white"
                                      : reservation.visitCount === 0
                                        ? "bg-rose-600 text-white"
                                        : "bg-white/80 text-slate-800"
                                  }`}
                                >
                                  {!reservation.customerId
                                    ? "顧客未連携"
                                    : reservation.visitCount === 0
                                      ? "新規"
                                      : `再来・${reservation.visitCount}回来店`}
                                </span>
                              ) : null}
                            </div>

                            {!reservation.isExternalBlock &&
                            !isCancelledStatus(reservation.status) &&
                            (reservation.allergy || reservation.caution) ? (
                              <div className="mt-1 truncate rounded-lg bg-red-50/90 px-2 py-1 font-bold text-red-700">
                                ⚠ {joinBriefParts([
                                  reservation.allergy,
                                  reservation.caution,
                                ])}
                              </div>
                            ) : null}

                            {!reservation.isExternalBlock &&
                            !isCancelledStatus(reservation.status) &&
                            reservation.previousMemo ? (
                              <div className="mt-1 truncate rounded-lg bg-white/70 px-2 py-1 text-slate-700">
                                💬 前回: {reservation.previousMemo}
                              </div>
                            ) : null}

                            {!reservation.isExternalBlock &&
                            !isCancelledStatus(reservation.status) &&
                            reservation.previousMenu ? (
                              <div className="mt-1 truncate rounded-lg bg-white/70 px-2 py-1 text-slate-700">
                                💅 前回: {reservation.previousMenu}
                              </div>
                            ) : null}

                            {!reservation.isExternalBlock &&
                            !isCancelledStatus(reservation.status) &&
                            reservation.nextProposal ? (
                              <div className="mt-1 truncate rounded-lg bg-amber-50/90 px-2 py-1 font-bold text-amber-800">
                                ✨ 提案: {reservation.nextProposal}
                              </div>
                            ) : null}
                          </>
                        );
                        const className = `absolute left-2 right-2 overflow-hidden rounded-2xl border p-2 text-xs shadow-sm ${colorClass} ${
                          overlapIds.has(reservation.id)
                            ? "ring-2 ring-rose-400"
                            : ""
                        } ${
                          isCancelledStatus(reservation.status)
                            ? "line-through"
                            : ""
                        }`;

                        const style = {
                          top: Math.max(top, 0),
                          height: Math.max(height - 6, 52),
                        };

                        if (reservation.isExternalBlock) {
                          return (
                            <div
                              key={reservation.id}
                              className={className}
                              style={style}
                            >
                              {cardContent}

                              <button
                                type="button"
                                onClick={async () => {
                                  const ok =
                                    window.confirm(
                                      "この外部予約ブロックを削除しますか？",
                                    );

                                  if (!ok) return;

                                  try {
                                    const blockId = reservation.id.replace(
                                      "external-",
                                      "",
                                    );

                                    const res = await fetch(
                                      "/api/external-calendar-blocks/delete",
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          id: blockId,
                                        }),
                                      },
                                    );

                                    const data = await res.json();

                                    if (!res.ok || !data.ok) {
                                      throw new Error(
                                        data?.error || "削除に失敗しました",
                                      );
                                    }

                                    alert("削除しました");

                                    await fetchCalendarData();
                                  } catch (error) {
                                    console.error(error);

                                    alert(
                                      error instanceof Error
                                        ? error.message
                                        : "削除に失敗しました",
                                    );
                                  }
                                }}
                                className="mt-2 w-full rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white"
                              >
                                削除
                              </button>
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={reservation.id}
                            href={`/reservations/edit/${reservation.id}`}
                            className={className}
                            style={style}
                          >
                            {cardContent}
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
