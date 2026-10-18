import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

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

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function readErrorResponse() {
  return errorResponse(
    "顧客詳細を取得できませんでした。通信状況を確認して再試行してください。",
    500,
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  try {
    const { id: customerId } = await context.params;
    const supabase = getSupabaseAdmin();
    const salonId =
      authentication.principal.authenticationMode === "supabase"
        ? authentication.principal.salonId
        : null;

    let customerQuery = supabase
      .from("customers")
      .select("id, name, name_kana, phone")
      .eq("id", customerId);

    if (salonId) {
      customerQuery = customerQuery.eq("salon_id", salonId);
    }

    const customerResult = await customerQuery.maybeSingle();

    if (customerResult.error) return readErrorResponse();
    if (!customerResult.data) {
      return errorResponse("顧客情報が見つかりません。", 404);
    }

    let visitsQuery = supabase
      .from("visits")
      .select(
        "id, customer_id, visit_date, menu_name, menu, color, price, payment_method, memo, next_visit_date, next_proposal",
      )
      .eq("customer_id", customerId)
      .order("visit_date", { ascending: false });
    let reservationsQuery = supabase
      .from("reservations")
      .select("id, customer_id, staff_id, status, start_at, menu")
      .eq("customer_id", customerId);

    if (salonId) {
      visitsQuery = visitsQuery.eq("salon_id", salonId);
      reservationsQuery = reservationsQuery.eq("salon_id", salonId);
    }

    const [visitsResult, reservationsResult, intakeResult] = await Promise.all([
      visitsQuery,
      reservationsQuery,
      supabase
        .from("customer_intakes")
        .select(
          "id, customer_id, name, phone, birth_date, allergy, skin_trouble, constitution, avoid_items, signer_name, signature_data_url, check_health, check_reaction, check_refund, check_condition, check_photo, submitted_at, created_at",
        )
        .eq("customer_id", customerId),
    ]);

    if (
      visitsResult.error ||
      reservationsResult.error ||
      intakeResult.error
    ) {
      return readErrorResponse();
    }

    const visits = visitsResult.data || [];
    const reservations = reservationsResult.data || [];
    const visitIds = visits
      .map((visit) => visit.id)
      .filter((visitId): visitId is string =>
        typeof visitId === "string" && visitId.length > 0,
      );
    const staffIds = Array.from(
      new Set(
        reservations
          .map((reservation) => reservation.staff_id)
          .filter((staffId): staffId is string =>
            typeof staffId === "string" && staffId.length > 0,
          ),
      ),
    );

    let visitPayments: unknown[] = [];
    let visitPhotos: unknown[] = [];
    let staffs: unknown[] = [];

    const relatedQueries: Array<PromiseLike<{ data: unknown[] | null; error: unknown }>> = [];
    const relatedKeys: Array<"visitPayments" | "visitPhotos" | "staffs"> = [];

    if (visitIds.length > 0) {
      relatedQueries.push(
        supabase
          .from("visit_payments")
          .select("id, visit_id, payment_method, amount, sort_order")
          .in("visit_id", visitIds)
          .order("sort_order", { ascending: true }),
      );
      relatedKeys.push("visitPayments");

      let photosQuery = supabase
        .from("visit_photos")
        .select("id, visit_id, salon_id, image_url, photo_type, created_at")
        .in("visit_id", visitIds)
        .order("created_at", { ascending: true });

      if (salonId) {
        photosQuery = photosQuery.eq("salon_id", salonId);
      }

      relatedQueries.push(photosQuery);
      relatedKeys.push("visitPhotos");
    }

    if (staffIds.length > 0) {
      let staffsQuery = supabase
        .from("staffs")
        .select("id, name")
        .in("id", staffIds);

      if (salonId) {
        staffsQuery = staffsQuery.eq("salon_id", salonId);
      }

      relatedQueries.push(staffsQuery);
      relatedKeys.push("staffs");
    }

    const relatedResults = await Promise.all(relatedQueries);

    if (relatedResults.some((result) => result.error)) {
      return readErrorResponse();
    }

    relatedResults.forEach((result, index) => {
      const data = result.data || [];
      const key = relatedKeys[index];
      if (key === "visitPayments") visitPayments = data;
      if (key === "visitPhotos") visitPhotos = data;
      if (key === "staffs") staffs = data;
    });

    return NextResponse.json({
      ok: true,
      customer: customerResult.data,
      visits,
      visitPayments,
      visitPhotos,
      reservations,
      staffs,
      customerIntakes: intakeResult.data || [],
    });
  } catch {
    return readErrorResponse();
  }
}
