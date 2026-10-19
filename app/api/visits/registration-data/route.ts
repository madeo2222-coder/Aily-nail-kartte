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
    "来店登録用の顧客一覧を取得できませんでした。通信状態を確認して再試行してください。",
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
      .select("id, name, phone, salon_id")
      .order("name", { ascending: true });

    if (salonId) {
      customersQuery = customersQuery.eq("salon_id", salonId);
    }

    const [customersResult, staffsResult] = await Promise.all([
      customersQuery,
      salonId
        ? supabase
            .from("staffs")
            .select("id, name, salon_id")
            .eq("salon_id", salonId)
            .eq("role", "staff")
            .eq("is_active", true)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (customersResult.error || staffsResult.error) {
      return readErrorResponse();
    }

    return NextResponse.json({
      ok: true,
      authenticationMode: authentication.principal.authenticationMode,
      customers: customersResult.data || [],
      staffs: staffsResult.data || [],
    });
  } catch {
    return readErrorResponse();
  }
}
