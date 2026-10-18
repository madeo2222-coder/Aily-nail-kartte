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
        "予約カレンダーを取得できませんでした。通信状況を確認して再試行してください。",
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
        "id, customer_id, staff_id, menu, status, memo, source, start_at, end_at, created_at",
      )
      .order("start_at", { ascending: true });
    let externalBlocksQuery = supabase
      .from("external_calendar_blocks")
      .select(
        "id, salon_id, staff_id, source, title, start_at, end_at, memo, created_at",
      )
      .order("start_at", { ascending: true });
    let staffsQuery = supabase
      .from("staffs")
      .select("id, name")
      .eq("role", "staff")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (salonId) {
      reservationsQuery = reservationsQuery.eq("salon_id", salonId);
      externalBlocksQuery = externalBlocksQuery.eq("salon_id", salonId);
      staffsQuery = staffsQuery.eq("salon_id", salonId);
    }

    const [reservationsResult, externalBlocksResult, staffsResult] =
      await Promise.all([
        reservationsQuery,
        externalBlocksQuery,
        staffsQuery,
      ]);

    const primaryError =
      reservationsResult.error ||
      externalBlocksResult.error ||
      staffsResult.error;

    if (primaryError) return readErrorResponse();

    const reservations = reservationsResult.data || [];
    const customerIds = Array.from(
      new Set(
        reservations
          .map((reservation) => reservation.customer_id)
          .filter((customerId): customerId is string =>
            typeof customerId === "string" && customerId.length > 0
          ),
      ),
    );

    if (customerIds.length === 0) {
      return NextResponse.json({
        ok: true,
        reservations,
        externalBlocks: externalBlocksResult.data || [],
        customers: [],
        staffs: staffsResult.data || [],
        visits: [],
        customerIntakes: [],
      });
    }

    let visitsQuery = supabase
      .from("visits")
      .select(
        "customer_id, visit_date, menu_name, menu, memo, next_proposal",
      )
      .in("customer_id", customerIds)
      .order("visit_date", { ascending: false });

    if (salonId) {
      visitsQuery = visitsQuery.eq("salon_id", salonId);
    }

    const [customersResult, visitsResult, customerIntakesResult] =
      await Promise.all([
        supabase
          .from("customers")
          .select("id, name")
          .in("id", customerIds),
        visitsQuery,
        supabase
          .from("customer_intakes")
          .select(
            "customer_id, allergy, skin_trouble, constitution, avoid_items, submitted_at, created_at",
          )
          .in("customer_id", customerIds)
          .order("created_at", { ascending: false }),
      ]);

    const relatedError =
      customersResult.error ||
      visitsResult.error ||
      customerIntakesResult.error;

    if (relatedError) return readErrorResponse();

    return NextResponse.json({
      ok: true,
      reservations,
      externalBlocks: externalBlocksResult.data || [],
      customers: customersResult.data || [],
      staffs: staffsResult.data || [],
      visits: visitsResult.data || [],
      customerIntakes: customerIntakesResult.data || [],
    });
  } catch {
    return readErrorResponse();
  }
}
