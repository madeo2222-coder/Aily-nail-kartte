import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

const NORMAL_STATUSES = new Set(["予約", "来店", "完了", "キャンセル"]);
const CANCELLED_STATUSES = new Set([
  "キャンセル",
  "cancelled",
  "canceled",
  "rejected",
  "declined",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CreateReservationBody = {
  mode?: unknown;
  salonId?: unknown;
  customerId?: unknown;
  staffId?: unknown;
  menu?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  status?: unknown;
  memo?: unknown;
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

function internalErrorResponse() {
  return errorResponse(
    "予約を登録できませんでした。通信状況を確認して再試行してください。",
    500,
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function validDateRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;

  return (
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    durationMinutes >= 30 &&
    durationMinutes <= 24 * 60
  );
}

async function authenticate() {
  return authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
}

export async function GET() {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  try {
    const supabase = getSupabaseAdmin();
    const salonId =
      authentication.principal.authenticationMode === "supabase"
        ? authentication.principal.salonId
        : null;

    let salonsQuery = supabase
      .from("salons")
      .select("id, name")
      .order("created_at", { ascending: true });
    let customersQuery = supabase
      .from("customers")
      .select("id, name, salon_id")
      .order("created_at", { ascending: false });
    let staffsQuery = supabase
      .from("staffs")
      .select("id, name, salon_id")
      .eq("role", "staff")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (salonId) {
      salonsQuery = salonsQuery.eq("id", salonId);
      customersQuery = customersQuery.or(
        `salon_id.eq.${salonId},salon_id.is.null`,
      );
      staffsQuery = staffsQuery.eq("salon_id", salonId);
    }

    const [salonsResult, customersResult, staffsResult] = await Promise.all([
      salonsQuery,
      customersQuery,
      staffsQuery,
    ]);

    if (salonsResult.error || customersResult.error || staffsResult.error) {
      return errorResponse(
        "予約登録に必要なデータを取得できませんでした。通信状態を確認して再試行してください。",
        500,
      );
    }

    return NextResponse.json({
      ok: true,
      salons: salonsResult.data || [],
      customers: customersResult.data || [],
      staffs: staffsResult.data || [],
    });
  } catch {
    return errorResponse(
      "予約登録に必要なデータを取得できませんでした。通信状態を確認して再試行してください。",
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  let body: CreateReservationBody;

  try {
    body = (await request.json()) as CreateReservationBody;
  } catch {
    return errorResponse("入力内容を確認してください。", 400);
  }

  const mode = cleanString(body.mode);
  const requestedSalonId = cleanString(body.salonId);
  const customerId = cleanString(body.customerId);
  const staffId = cleanString(body.staffId);
  const menu = cleanString(body.menu);
  const startAt = cleanString(body.startAt);
  const endAt = cleanString(body.endAt);
  const requestedStatus = cleanString(body.status);
  const memo = cleanString(body.memo);
  const salonId =
    authentication.principal.authenticationMode === "supabase"
      ? authentication.principal.salonId
      : requestedSalonId;

  if (mode !== "normal" && mode !== "external") {
    return errorResponse("登録種別を確認してください。", 400);
  }

  if (
    !validUuid(salonId) ||
    !validUuid(staffId) ||
    (mode === "normal" && !validUuid(customerId))
  ) {
    return errorResponse("サロン・顧客・担当スタッフを確認してください。", 400);
  }

  if (
    authentication.principal.authenticationMode === "supabase" &&
    requestedSalonId &&
    requestedSalonId !== salonId
  ) {
    return errorResponse("所属サロン以外の予約は登録できません。", 403);
  }

  if (!menu || menu.length > 500 || memo.length > 5_000) {
    return errorResponse("メニューまたはメモの内容を確認してください。", 400);
  }

  if (!validDateRange(startAt, endAt)) {
    return errorResponse("予約日時を確認してください。", 400);
  }

  if (mode === "normal" && !NORMAL_STATUSES.has(requestedStatus)) {
    return errorResponse("予約ステータスを確認してください。", 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const staffResult = await supabase
      .from("staffs")
      .select("id, salon_id, role, is_active")
      .eq("id", staffId)
      .eq("salon_id", salonId)
      .maybeSingle();

    if (staffResult.error) return internalErrorResponse();

    if (
      !staffResult.data ||
      staffResult.data.role !== "staff" ||
      staffResult.data.is_active !== true
    ) {
      return errorResponse("担当スタッフを確認してください。", 400);
    }

    if (mode === "normal") {
      const customerResult = await supabase
        .from("customers")
        .select("id, salon_id")
        .eq("id", customerId)
        .maybeSingle();

      if (customerResult.error) return internalErrorResponse();

      if (
        !customerResult.data ||
        (customerResult.data.salon_id !== null &&
          customerResult.data.salon_id !== salonId)
      ) {
        return errorResponse("顧客を確認してください。", 400);
      }
    }

    const [reservationsResult, blocksResult] = await Promise.all([
      supabase
        .from("reservations")
        .select("id, status, staff_id")
        .eq("salon_id", salonId)
        .lt("start_at", endAt)
        .gt("end_at", startAt),
      supabase
        .from("external_calendar_blocks")
        .select("id, staff_id")
        .eq("salon_id", salonId)
        .lt("start_at", endAt)
        .gt("end_at", startAt),
    ]);

    if (reservationsResult.error || blocksResult.error) {
      return internalErrorResponse();
    }

    const reservationOverlap = (reservationsResult.data || []).some(
      (reservation) =>
        (reservation.staff_id === null || reservation.staff_id === staffId) &&
        !CANCELLED_STATUSES.has(reservation.status || ""),
    );
    const blockOverlap = (blocksResult.data || []).some(
      (block) => block.staff_id === null || block.staff_id === staffId,
    );

    if (reservationOverlap || blockOverlap) {
      return errorResponse(
        "この時間帯はすでに予約またはブロックがあります。カレンダーで確認してください。",
        409,
      );
    }

    const insertPayload: Record<string, string | null> = {
      salon_id: salonId,
      customer_id: mode === "normal" ? customerId : null,
      staff_id: staffId,
      menu,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      status: mode === "external" ? "予約確定" : requestedStatus,
      memo: memo || null,
    };
    const insertResult = await supabase
      .from("reservations")
      .insert([insertPayload])
      .select("id")
      .single();

    if (insertResult.error || !insertResult.data?.id) {
      return internalErrorResponse();
    }

    return NextResponse.json({ ok: true, id: insertResult.data.id });
  } catch {
    return internalErrorResponse();
  }
}
