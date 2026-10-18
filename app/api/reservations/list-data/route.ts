import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

const RESERVATION_RESPONSE_FIELDS = [
  "id",
  "customer_id",
  "staff_id",
  "status",
  "created_at",
  "reservation_date",
  "reservation_time",
  "date",
  "time",
  "reserved_at",
  "visit_date",
  "menu_name",
  "menu",
  "staff_name",
  "staff",
  "duration_minutes",
  "duration",
  "source",
  "memo",
  "note",
  "start_at",
  "end_at",
] as const;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase configuration is missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readErrorResponse() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "予約情報を取得できませんでした。通信状況を確認して再試行してください。",
    },
    { status: 500 },
  );
}

function projectReservation(row: Record<string, unknown>) {
  return Object.fromEntries(
    RESERVATION_RESPONSE_FIELDS.flatMap((field) =>
      field in row ? [[field, row[field]]] : [],
    ),
  );
}

export async function GET() {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });

  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, error: authentication.error },
      { status: authentication.status },
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const salonId =
      authentication.principal.authenticationMode === "supabase"
        ? authentication.principal.salonId
        : null;

    // The production table has retained legacy date/menu aliases. Read them on
    // the server, then return only the fields the reservation list understands.
    let reservationsQuery = supabase
      .from("reservations")
      .select("*")
      .order("created_at", { ascending: false });
    let staffsQuery = supabase.from("staffs").select("id, name");

    if (salonId) {
      reservationsQuery = reservationsQuery.eq("salon_id", salonId);
      staffsQuery = staffsQuery.eq("salon_id", salonId);
    }

    const [reservationsResult, staffsResult] = await Promise.all([
      reservationsQuery,
      staffsQuery,
    ]);

    if (reservationsResult.error || staffsResult.error) {
      return readErrorResponse();
    }

    const reservationRows = (reservationsResult.data || []) as Array<
      Record<string, unknown>
    >;
    const reservations = reservationRows.map(projectReservation);
    const customerIds = Array.from(
      new Set(
        reservationRows
          .map((reservation) => reservation.customer_id)
          .filter(
            (customerId): customerId is string =>
              typeof customerId === "string" && customerId.length > 0,
          ),
      ),
    );

    if (customerIds.length === 0) {
      return NextResponse.json({
        ok: true,
        reservations,
        customers: [],
        staffs: staffsResult.data || [],
      });
    }

    const customersResult = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds);

    if (customersResult.error) return readErrorResponse();

    return NextResponse.json({
      ok: true,
      reservations,
      customers: customersResult.data || [],
      staffs: staffsResult.data || [],
    });
  } catch {
    return readErrorResponse();
  }
}
