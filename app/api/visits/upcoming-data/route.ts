import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type VisitRow = {
  id: string;
  customer_id: string;
  visit_date: string | null;
  next_visit_date: string;
  next_suggestion: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
};

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
    "来店予定を取得できませんでした。時間をおいて再試行してください。",
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

    let visitsQuery = supabase
      .from("visits")
      .select("id, customer_id, visit_date, next_visit_date, next_suggestion")
      .not("next_visit_date", "is", null)
      .order("next_visit_date", { ascending: true });

    if (salonId) {
      visitsQuery = visitsQuery.eq("salon_id", salonId);
    }

    const visitsResult = await visitsQuery;
    if (visitsResult.error) return readErrorResponse();

    const visits = (visitsResult.data || []) as VisitRow[];
    if (visits.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const customerIds = Array.from(
      new Set(visits.map((visit) => visit.customer_id).filter(Boolean)),
    );
    let customersQuery = supabase
      .from("customers")
      .select("id, name, phone")
      .in("id", customerIds);

    if (salonId) {
      customersQuery = customersQuery.eq("salon_id", salonId);
    }

    const customersResult = await customersQuery;
    if (customersResult.error) return readErrorResponse();

    const customers = new Map(
      ((customersResult.data || []) as CustomerRow[]).map((customer) => [
        customer.id,
        customer,
      ]),
    );

    return NextResponse.json({
      ok: true,
      items: visits.map((visit) => {
        const customer = customers.get(visit.customer_id);

        return {
          id: visit.id,
          customer_id: visit.customer_id,
          customer_name: customer?.name || "不明",
          phone: customer?.phone || null,
          last_visit_date: visit.visit_date || null,
          next_visit_date: visit.next_visit_date,
          next_suggestion: visit.next_suggestion || null,
        };
      }),
    });
  } catch {
    return readErrorResponse();
  }
}
