import "server-only";

import { createClient } from "@supabase/supabase-js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VisitRegistrationCustomer = {
  id: string;
  name: string;
};

export type VisitRegistrationStaff = {
  id: string;
  name: string;
};

export type VisitRegistrationReservation = {
  id: string;
  customerId: string;
  customerName: string;
  staffId: string;
  staffName: string;
  visitDate: string;
  menuName: string;
  memo: string;
};

export type VisitRegistrationFormData = {
  customers: VisitRegistrationCustomer[];
  staffs: VisitRegistrationStaff[];
  reservation: VisitRegistrationReservation | null;
  initialCustomerId: string;
};

export type VisitRegistrationFormDataResult =
  | { ok: true; data: VisitRegistrationFormData }
  | { ok: false; message: string };

type ReservationRow = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  staff_id: string | null;
  status: string | null;
  menu: string | null;
  start_at: string | null;
  memo: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function toJstDate(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");

  return year && month && day ? `${year}-${month}-${day}` : null;
}

function normalizeNamedRows(
  rows: Array<{ id: string; name: string | null }> | null
) {
  return (rows ?? [])
    .filter(
      (row): row is { id: string; name: string } =>
        UUID_PATTERN.test(row.id) &&
        typeof row.name === "string" &&
        row.name.trim().length > 0
    )
    .map((row) => ({ id: row.id, name: row.name.trim() }));
}

export async function loadVisitRegistrationFormData({
  salonId,
  reservationId,
  requestedCustomerId,
}: {
  salonId: string;
  reservationId: string | null;
  requestedCustomerId: string | null;
}): Promise<VisitRegistrationFormDataResult> {
  if (!UUID_PATTERN.test(salonId)) {
    return { ok: false, message: "サロン情報を確認できませんでした。" };
  }

  if (reservationId !== null && !UUID_PATTERN.test(reservationId)) {
    return { ok: false, message: "予約情報を確認できませんでした。" };
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return { ok: false, message: "登録画面を準備できませんでした。" };
  }

  const [customersResult, staffsResult, reservationResult] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("id, name")
      .eq("salon_id", salonId)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("staffs")
      .select("id, name")
      .eq("salon_id", salonId)
      .eq("role", "staff")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    reservationId === null
      ? Promise.resolve({ data: null, error: null })
      : supabaseAdmin
          .from("reservations")
          .select(
            "id, salon_id, customer_id, staff_id, status, menu, start_at, memo"
          )
          .eq("id", reservationId)
          .eq("salon_id", salonId)
          .limit(2),
  ]);

  if (customersResult.error || staffsResult.error || reservationResult.error) {
    return { ok: false, message: "登録画面を準備できませんでした。" };
  }

  const customers = normalizeNamedRows(customersResult.data);
  const staffs = normalizeNamedRows(staffsResult.data);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const staffMap = new Map(staffs.map((staff) => [staff.id, staff]));

  let reservation: VisitRegistrationReservation | null = null;

  if (reservationId !== null) {
    const reservationRows = (reservationResult.data ?? []) as ReservationRow[];

    if (reservationRows.length !== 1) {
      return { ok: false, message: "予約情報を確認できませんでした。" };
    }

    const row = reservationRows[0];
    const customer = row.customer_id ? customerMap.get(row.customer_id) : null;
    const staff = row.staff_id ? staffMap.get(row.staff_id) : null;
    const visitDate = toJstDate(row.start_at);

    if (
      row.id !== reservationId ||
      row.salon_id !== salonId ||
      (row.status !== "confirmed" && row.status !== "予約確定") ||
      !customer ||
      !staff ||
      !visitDate
    ) {
      return { ok: false, message: "予約情報を確認できませんでした。" };
    }

    reservation = {
      id: row.id,
      customerId: customer.id,
      customerName: customer.name,
      staffId: staff.id,
      staffName: staff.name,
      visitDate,
      menuName: row.menu?.trim() ?? "",
      memo: row.memo?.trim() ?? "",
    };
  }

  const initialCustomerId = reservation
    ? reservation.customerId
    : requestedCustomerId && customerMap.has(requestedCustomerId)
      ? requestedCustomerId
      : "";

  return {
    ok: true,
    data: {
      customers,
      staffs,
      reservation,
      initialCustomerId,
    },
  };
}
