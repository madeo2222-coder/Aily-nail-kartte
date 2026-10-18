import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type UpdateCustomerBody = {
  name?: unknown;
  nameKana?: unknown;
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

function readErrorResponse() {
  return errorResponse(
    "顧客情報を取得できませんでした。通信状況を確認して再試行してください。",
    500,
  );
}

function writeErrorResponse() {
  return errorResponse(
    "顧客情報を更新できませんでした。通信状況を確認して再試行してください。",
    500,
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: string) {
  const raw = value.replace(/[^\d+]/g, "");

  if (raw.startsWith("+81")) return raw;
  if (raw.startsWith("0")) return `+81${raw.slice(1)}`;
  return raw;
}

async function authenticate() {
  return authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  try {
    const { id: customerId } = await context.params;

    if (!customerId) return errorResponse("顧客情報が見つかりません。", 404);

    const isIndividualStaff =
      authentication.principal.authenticationMode === "supabase";
    const salonId = isIndividualStaff
      ? authentication.principal.salonId
      : null;

    if (isIndividualStaff && !salonId) {
      return errorResponse("所属サロンを確認できませんでした。", 403);
    }

    const supabase = getSupabaseAdmin();
    let customerQuery = supabase
      .from("customers")
      .select("id, name, name_kana, phone")
      .eq("id", customerId);

    if (salonId) customerQuery = customerQuery.eq("salon_id", salonId);

    const result = await customerQuery.maybeSingle();

    if (result.error) return readErrorResponse();
    if (!result.data) return errorResponse("顧客情報が見つかりません。", 404);

    return NextResponse.json({ ok: true, customer: result.data });
  } catch {
    return readErrorResponse();
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  let body: UpdateCustomerBody;

  try {
    body = (await request.json()) as UpdateCustomerBody;
  } catch {
    return errorResponse("入力内容を確認してください。", 400);
  }

  const name = cleanString(body.name);
  const nameKana = cleanString(body.nameKana);
  const phone = cleanString(body.phone);

  if (!name || name.length > 200 || nameKana.length > 200 || phone.length > 50) {
    return errorResponse("名前、フリガナ、電話番号を確認してください。", 400);
  }

  try {
    const { id: customerId } = await context.params;

    if (!customerId) return errorResponse("顧客情報が見つかりません。", 404);

    const isIndividualStaff =
      authentication.principal.authenticationMode === "supabase";
    const salonId = isIndividualStaff
      ? authentication.principal.salonId
      : null;

    if (isIndividualStaff && !salonId) {
      return errorResponse("所属サロンを確認できませんでした。", 403);
    }

    const supabase = getSupabaseAdmin();
    let updateQuery = supabase
      .from("customers")
      .update({
        name,
        name_kana: nameKana || null,
        phone: phone ? normalizePhone(phone) : null,
      })
      .eq("id", customerId);

    if (salonId) updateQuery = updateQuery.eq("salon_id", salonId);

    const result = await updateQuery.select("id").maybeSingle();

    if (result.error) return writeErrorResponse();
    if (!result.data?.id) {
      return errorResponse("顧客情報が見つかりません。", 404);
    }

    return NextResponse.json({ ok: true, id: result.data.id });
  } catch {
    return writeErrorResponse();
  }
}
