import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set([
  "予約",
  "confirmed",
  "来店",
  "完了",
  "キャンセル",
]);
const CANCELLED_STATUSES = new Set([
  "キャンセル",
  "cancelled",
  "canceled",
  "rejected",
  "declined",
]);
const CONFIRMED_STATUSES = new Set(["confirmed", "予約確定"]);
const ACTIVE_RESERVATION_STATUSES = new Set(["予約", "confirmed", "予約確定"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

type EditReservationBody = {
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
    "予約を更新できませんでした。通信状況を確認して再試行してください。",
    500,
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  return value === null ? null : cleanString(value);
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

async function findReservation(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  reservationId: string,
  salonId: string | null,
) {
  let query = supabase
    .from("reservations")
    .select(
      "id, salon_id, customer_id, staff_id, menu, start_at, end_at, status, memo",
    )
    .eq("id", reservationId);

  if (salonId) query = query.eq("salon_id", salonId);

  return query.maybeSingle();
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  const { id: reservationId } = await context.params;

  if (!validUuid(reservationId)) {
    return errorResponse("予約IDを確認してください。", 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const salonId =
      authentication.principal.authenticationMode === "supabase"
        ? authentication.principal.salonId
        : null;
    const reservationResult = await findReservation(
      supabase,
      reservationId,
      salonId,
    );

    if (reservationResult.error) {
      return errorResponse("予約情報を取得できませんでした。", 500);
    }

    if (!reservationResult.data) {
      return errorResponse("予約が見つかりません。", 404);
    }

    const reservationSalonId = reservationResult.data.salon_id;

    if (!reservationSalonId) {
      return errorResponse("予約のサロン情報を確認してください。", 409);
    }

    let salonsQuery = supabase
      .from("salons")
      .select("id, name")
      .order("created_at", { ascending: true });
    let customersQuery = supabase
      .from("customers")
      .select("id, name, salon_id")
      .order("name", { ascending: true });
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
      return errorResponse("予約情報を取得できませんでした。", 500);
    }

    return NextResponse.json({
      ok: true,
      reservation: reservationResult.data,
      salons: salonsResult.data || [],
      customers: customersResult.data || [],
      staffs: staffsResult.data || [],
    });
  } catch {
    return errorResponse("予約情報を取得できませんでした。", 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  let body: EditReservationBody;

  try {
    body = (await request.json()) as EditReservationBody;
  } catch {
    return errorResponse("入力内容を確認してください。", 400);
  }

  const { id: reservationId } = await context.params;
  const requestedSalonId = cleanString(body.salonId);
  const customerId = optionalString(body.customerId);
  const staffId = cleanString(body.staffId);
  const menu = cleanString(body.menu);
  const startAt = cleanString(body.startAt);
  const endAt = cleanString(body.endAt);
  const status = cleanString(body.status);
  const memo = optionalString(body.memo);
  const salonId =
    authentication.principal.authenticationMode === "supabase"
      ? authentication.principal.salonId
      : requestedSalonId;

  if (
    !validUuid(reservationId) ||
    !validUuid(salonId) ||
    !validUuid(staffId) ||
    (customerId !== null && !validUuid(customerId))
  ) {
    return errorResponse("予約・サロン・顧客・担当スタッフを確認してください。", 400);
  }

  if (
    authentication.principal.authenticationMode === "supabase" &&
    requestedSalonId &&
    requestedSalonId !== salonId
  ) {
    return errorResponse("所属サロン以外の予約は更新できません。", 403);
  }

  if (
    menu.length > 500 ||
    (memo?.length || 0) > 5_000 ||
    !ALLOWED_STATUSES.has(status) ||
    !validDateRange(startAt, endAt)
  ) {
    return errorResponse("予約内容または予約日時を確認してください。", 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const reservationResult = await findReservation(
      supabase,
      reservationId,
      authentication.principal.authenticationMode === "supabase"
        ? salonId
        : null,
    );

    if (reservationResult.error) return internalErrorResponse();
    if (!reservationResult.data) {
      return errorResponse("予約が見つかりません。", 404);
    }

    const nextStartTime = new Date(startAt).getTime();
    const currentStartTime = new Date(
      reservationResult.data.start_at || "",
    ).getTime();
    const activatesElapsedTime =
      ACTIVE_RESERVATION_STATUSES.has(status) &&
      nextStartTime <= Date.now() &&
      (!ACTIVE_RESERVATION_STATUSES.has(
        reservationResult.data.status || "",
      ) || currentStartTime !== nextStartTime);

    if (activatesElapsedTime) {
      return errorResponse(
        "開始時刻を過ぎた日時へ予約を変更できません。日時を確認してください。",
        409,
      );
    }

    if (
      status === "confirmed" &&
      !CONFIRMED_STATUSES.has(reservationResult.data.status || "")
    ) {
      return errorResponse(
        "予約確定は『予約確定にする』から実行してください。",
        409,
      );
    }

    if (
      CANCELLED_STATUSES.has(status) &&
      reservationResult.data.customer_id !== null &&
      !CANCELLED_STATUSES.has(reservationResult.data.status || "")
    ) {
      return errorResponse(
        "顧客予約のキャンセルはキャンセル通知の確認画面から実行してください。",
        409,
      );
    }

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

    if (customerId !== null) {
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

    if (!CANCELLED_STATUSES.has(status)) {
      const [reservationsResult, blocksResult] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, status, staff_id")
          .eq("salon_id", salonId)
          .neq("id", reservationId)
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
    }

    const updateResult = await supabase
      .from("reservations")
      .update({
        salon_id: salonId,
        customer_id: customerId,
        staff_id: staffId,
        menu: menu || null,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        status,
        memo: memo || null,
      })
      .eq("id", reservationId)
      .eq("salon_id", reservationResult.data.salon_id)
      .select("id")
      .maybeSingle();

    if (updateResult.error || !updateResult.data) {
      return internalErrorResponse();
    }

    return NextResponse.json({ ok: true, id: updateResult.data.id });
  } catch {
    return internalErrorResponse();
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  const { id: reservationId } = await context.params;

  if (!validUuid(reservationId)) {
    return errorResponse("予約IDを確認してください。", 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const salonId =
      authentication.principal.authenticationMode === "supabase"
        ? authentication.principal.salonId
        : null;
    const reservationResult = await findReservation(
      supabase,
      reservationId,
      salonId,
    );

    if (reservationResult.error) return internalErrorResponse();
    if (!reservationResult.data) {
      return errorResponse("予約が見つかりません。", 404);
    }

    const deleteResult = await supabase
      .from("reservations")
      .delete()
      .eq("id", reservationId)
      .eq("salon_id", reservationResult.data.salon_id)
      .select("id")
      .maybeSingle();

    if (deleteResult.error || !deleteResult.data) {
      return internalErrorResponse();
    }

    return NextResponse.json({ ok: true, id: deleteResult.data.id });
  } catch {
    return internalErrorResponse();
  }
}
