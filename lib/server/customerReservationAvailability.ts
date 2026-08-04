import type { SupabaseClient } from "@supabase/supabase-js";

const OPENING_TIME = "10:00";
const CLOSING_TIME = "19:00";
const SLOT_INTERVAL_MINUTES = 30;

export type CustomerBookingStaff = {
  id: string;
  name: string | null;
};

type BusyRow = {
  staff_id: string | null;
  start_at: string | null;
  end_at: string | null;
  status?: string | null;
};

export type CustomerAvailabilitySlot = {
  time: string;
  staffIds: string[];
};

function isCancelledStatus(status: string | null | undefined) {
  return status === "キャンセル" || status === "cancelled";
}

function buildUtcIsoFromJst(date: string, time: string) {
  const value = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function overlaps(startIso: string, endIso: string, row: BusyRow) {
  if (!row.start_at || !row.end_at) return false;
  return startIso < row.end_at && row.start_at < endIso;
}

function buildTimeOptions(durationMinutes: number) {
  const [openingHour, openingMinute] = OPENING_TIME.split(":").map(Number);
  const [closingHour, closingMinute] = CLOSING_TIME.split(":").map(Number);
  const openingMinutes = openingHour * 60 + openingMinute;
  const closingMinutes = closingHour * 60 + closingMinute;
  const values: string[] = [];

  for (
    let value = openingMinutes;
    value + durationMinutes <= closingMinutes;
    value += SLOT_INTERVAL_MINUTES
  ) {
    values.push(
      `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
        value % 60
      ).padStart(2, "0")}`
    );
  }

  return values;
}

export function normalizeCustomerBookingDuration(value: unknown) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 30 || minutes > 360) return null;
  return minutes;
}

export function getTodayJstText() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function addDaysText(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isValidCustomerBookingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const today = getTodayJstText();
  return value >= today && value <= addDaysText(today, 30);
}

export async function resolveCustomerBookingSalonId(
  supabase: SupabaseClient,
  customerSalonId: string | null
) {
  if (customerSalonId) return customerSalonId;

  const { data, error } = await supabase
    .from("salons")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(2);

  if (error) throw new Error("Salon lookup failed.");
  if (!data || data.length !== 1) return null;
  return String(data[0].id);
}

export async function getCustomerReservationAvailability({
  supabase,
  salonId,
  date,
  durationMinutes,
}: {
  supabase: SupabaseClient;
  salonId: string;
  date: string;
  durationMinutes: number;
}) {
  const dayStart = buildUtcIsoFromJst(date, "00:00");
  const nextDay = addDaysText(date, 1);
  const dayEnd = buildUtcIsoFromJst(nextDay, "00:00");

  if (!dayStart || !dayEnd) throw new Error("Invalid availability date.");

  const [staffResult, reservationResult, blockResult] = await Promise.all([
    supabase
      .from("staffs")
      .select("id, name")
      .eq("salon_id", salonId)
      .eq("role", "staff")
      .eq("is_active", true)
      .eq("customer_booking_enabled", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("reservations")
      .select("staff_id, status, start_at, end_at")
      .eq("salon_id", salonId)
      .lt("start_at", dayEnd)
      .gt("end_at", dayStart),
    supabase
      .from("external_calendar_blocks")
      .select("staff_id, start_at, end_at")
      .eq("salon_id", salonId)
      .lt("start_at", dayEnd)
      .gt("end_at", dayStart),
  ]);

  if (staffResult.error || reservationResult.error || blockResult.error) {
    throw new Error("Availability lookup failed.");
  }

  const staffs = (staffResult.data || []).map((staff) => ({
    id: String(staff.id),
    name: typeof staff.name === "string" ? staff.name : null,
  })) as CustomerBookingStaff[];
  const reservations = ((reservationResult.data || []) as BusyRow[]).filter(
    (row) => !isCancelledStatus(row.status)
  );
  const blocks = (blockResult.data || []) as BusyRow[];

  const slots = buildTimeOptions(durationMinutes)
    .map((time) => {
      const startIso = buildUtcIsoFromJst(date, time);
      if (!startIso) return null;
      const endIso = new Date(
        new Date(startIso).getTime() + durationMinutes * 60 * 1000
      ).toISOString();
      const staffIds = staffs
        .filter((staff) => {
          const reservationConflict = reservations.some(
            (row) =>
              (!row.staff_id || row.staff_id === staff.id) &&
              overlaps(startIso, endIso, row)
          );
          const blockConflict = blocks.some(
            (row) =>
              (!row.staff_id || row.staff_id === staff.id) &&
              overlaps(startIso, endIso, row)
          );
          return !reservationConflict && !blockConflict;
        })
        .map((staff) => staff.id);

      return staffIds.length > 0 ? { time, staffIds } : null;
    })
    .filter((slot): slot is CustomerAvailabilitySlot => Boolean(slot));

  return { staffs, slots };
}
