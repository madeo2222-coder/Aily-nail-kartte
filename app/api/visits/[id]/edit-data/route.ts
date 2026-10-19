import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type VisitRow = {
  id: string;
  customer_id: string | null;
  salon_id: string | null;
  visit_date: string | null;
  menu: string | null;
  menu_name: string | null;
  color: string | null;
  memo: string | null;
  price: number | null;
  payment_method: string | null;
  created_at: string | null;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function readErrorResponse() {
  return errorResponse(
    "来店履歴の編集データを取得できませんでした。通信状態を確認して再試行してください。",
    500,
  );
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase configuration is missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: visitId } = await context.params;
  if (!UUID_PATTERN.test(visitId)) {
    return errorResponse("来店情報を確認できません。", 400);
  }

  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  try {
    const supabase = getSupabaseAdmin();
    const salonId =
      authentication.principal.authenticationMode === "supabase"
        ? authentication.principal.salonId
        : null;

    let visitQuery = supabase
      .from("visits")
      .select(
        "id, customer_id, salon_id, visit_date, menu, menu_name, color, memo, price, payment_method, created_at",
      )
      .eq("id", visitId);

    if (salonId) {
      visitQuery = visitQuery.eq("salon_id", salonId);
    }

    const visitResult = await visitQuery.limit(2);
    if (visitResult.error) return readErrorResponse();

    const visits = (visitResult.data || []) as VisitRow[];
    if (visits.length !== 1) {
      return errorResponse("来店履歴が見つかりません。", 404);
    }

    const visit = visits[0];
    let customerQuery = visit.customer_id
      ? supabase
          .from("customers")
          .select("id, name, salon_id")
          .eq("id", visit.customer_id)
      : null;

    if (customerQuery && salonId) {
      customerQuery = customerQuery.eq("salon_id", salonId);
    }

    const [customerResult, photoResult, paymentResult] = await Promise.all([
      customerQuery
        ? customerQuery.limit(2)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("visit_photos")
        .select("id, visit_id, salon_id, image_url, photo_type, created_at")
        .eq("visit_id", visitId)
        .order("created_at", { ascending: true }),
      supabase
        .from("visit_payments")
        .select("id, visit_id, payment_method, amount, sort_order")
        .eq("visit_id", visitId)
        .order("sort_order", { ascending: true }),
    ]);

    if (customerResult.error || photoResult.error || paymentResult.error) {
      return readErrorResponse();
    }

    const customers = customerResult.data || [];
    if (visit.customer_id && customers.length !== 1) {
      return readErrorResponse();
    }

    return NextResponse.json({
      ok: true,
      visit: {
        id: visit.id,
        customer_id: visit.customer_id,
        visit_date: visit.visit_date,
        menu: visit.menu,
        menu_name: visit.menu_name,
        color: visit.color,
        memo: visit.memo,
        price: visit.price,
        payment_method: visit.payment_method,
        created_at: visit.created_at,
      },
      customer: customers[0] || null,
      photos: photoResult.data || [],
      payments: paymentResult.data || [],
    });
  } catch {
    return readErrorResponse();
  }
}
