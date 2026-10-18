import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  price: number | null;
  payment_method: string | null;
  memo: string | null;
  next_visit_date: string | null;
  next_proposal: string | null;
  next_suggestion: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
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
    "施術実績を取得できませんでした。通信状態を確認して再試行してください。",
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
      .select(
        "id, customer_id, visit_date, price, payment_method, memo, next_visit_date, next_proposal, next_suggestion",
      )
      .order("visit_date", { ascending: false });

    if (salonId) {
      visitsQuery = visitsQuery.eq("salon_id", salonId);
    }

    const visitsResult = await visitsQuery;
    if (visitsResult.error) return readErrorResponse();

    const visits = (visitsResult.data || []) as VisitRow[];
    const visitIds = visits.map((visit) => visit.id).filter(Boolean);
    const customerIds = Array.from(
      new Set(
        visits
          .map((visit) => visit.customer_id)
          .filter((customerId): customerId is string => Boolean(customerId)),
      ),
    );

    if (visits.length === 0) {
      return NextResponse.json({ ok: true, visits: [], payments: [] });
    }

    let customersQuery = supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds);

    if (salonId) {
      customersQuery = customersQuery.eq("salon_id", salonId);
    }

    const [customersResult, paymentsResult] = await Promise.all([
      customerIds.length > 0
        ? customersQuery
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("visit_payments")
        .select("id, visit_id, payment_method, amount, sort_order")
        .in("visit_id", visitIds)
        .order("sort_order", { ascending: true }),
    ]);

    if (customersResult.error || paymentsResult.error) {
      return readErrorResponse();
    }

    const customerNames = new Map(
      ((customersResult.data || []) as CustomerRow[]).map((customer) => [
        customer.id,
        customer.name,
      ]),
    );

    return NextResponse.json({
      ok: true,
      visits: visits.map((visit) => ({
        ...visit,
        customers: visit.customer_id
          ? { name: customerNames.get(visit.customer_id) ?? null }
          : null,
      })),
      payments: paymentsResult.data || [],
    });
  } catch {
    return readErrorResponse();
  }
}
