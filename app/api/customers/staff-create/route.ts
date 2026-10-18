import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type CreateCustomerBody = {
  name?: unknown;
  phone?: unknown;
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

function writeErrorResponse() {
  return errorResponse(
    "顧客を登録できませんでした。通信状態を確認して再試行してください。",
    500,
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value: string) {
  return value.replace(/[\s　]+/gu, "").trim();
}

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

export async function POST(request: NextRequest) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  let body: CreateCustomerBody;

  try {
    body = (await request.json()) as CreateCustomerBody;
  } catch {
    return errorResponse("入力内容を確認してください。", 400);
  }

  const name = cleanString(body.name);
  const phone = cleanString(body.phone);

  if (!normalizeName(name) || name.length > 200 || phone.length > 50) {
    return errorResponse("お名前または電話番号を確認してください。", 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const salonId =
      authentication.principal.authenticationMode === "supabase"
        ? authentication.principal.salonId
        : null;
    let customersQuery = supabase
      .from("customers")
      .select("id, name, phone")
      .not("name", "is", null);

    if (salonId) {
      customersQuery = customersQuery.eq("salon_id", salonId);
    }

    const customersResult = await customersQuery;

    if (customersResult.error) return writeErrorResponse();

    const compareName = normalizeName(name);
    const comparePhone = normalizePhone(phone);
    const customers = customersResult.data || [];
    const phoneMatch = comparePhone
      ? customers.find(
          (customer) => normalizePhone(customer.phone || "") === comparePhone,
        )
      : null;
    const nameMatch = customers.find(
      (customer) => normalizeName(customer.name || "") === compareName,
    );
    const existingId = phoneMatch?.id || nameMatch?.id;

    if (typeof existingId === "string" && existingId.length > 0) {
      return NextResponse.json({ ok: true, id: existingId, existing: true });
    }

    const insertPayload: {
      name: string;
      phone: string | null;
      salon_id?: string;
    } = {
      name,
      phone: phone || null,
    };

    if (salonId) insertPayload.salon_id = salonId;

    const insertResult = await supabase
      .from("customers")
      .insert([insertPayload])
      .select("id")
      .single();

    if (insertResult.error || !insertResult.data?.id) {
      return writeErrorResponse();
    }

    return NextResponse.json({
      ok: true,
      id: insertResult.data.id,
      existing: false,
    });
  } catch {
    return writeErrorResponse();
  }
}
