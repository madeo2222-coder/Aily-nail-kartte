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

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function readErrorResponse() {
  return errorResponse(
    "顧客一覧を取得できませんでした。通信状態を確認して再試行してください。",
    500,
  );
}

export async function GET() {
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

    let customersQuery = supabase
      .from("customers")
      .select("id, name, name_kana, allergy")
      .order("created_at", { ascending: false });
    let visitsQuery = supabase
      .from("visits")
      .select("customer_id, next_visit_date, next_proposal, visit_date")
      .order("visit_date", { ascending: false });

    if (salonId) {
      customersQuery = customersQuery.eq("salon_id", salonId);
      visitsQuery = visitsQuery.eq("salon_id", salonId);
    }

    const [customersResult, visitsResult] = await Promise.all([
      customersQuery,
      visitsQuery,
    ]);

    if (customersResult.error || visitsResult.error) {
      return readErrorResponse();
    }

    return NextResponse.json({
      ok: true,
      customers: customersResult.data || [],
      visits: visitsResult.data || [],
    });
  } catch {
    return readErrorResponse();
  }
}
