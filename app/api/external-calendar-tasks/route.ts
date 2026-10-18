import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

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
        "外部カレンダー反映タスクを取得できませんでした。通信状況を確認して再試行してください。",
    },
    { status: 500 },
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

    let reservationsQuery = supabase
      .from("reservations")
      .select(
        "id, customer_id, staff_id, menu, start_at, end_at, status, memo",
      )
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true });
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

    const reservations = reservationsResult.data || [];
    const customerIds = Array.from(
      new Set(
        reservations
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

    if (customersResult.error) {
      return readErrorResponse();
    }

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
