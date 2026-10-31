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
const ACTIVE_RESERVATION_STATUSES = new Set(["予約", "confirmed"]);
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
  expectedCustomerId?: unknown;
  expectedStaffId?: unknown;
  expectedMenu?: unknown;
  expectedStatus?: unknown;
  expectedMemo?: unknown;
  expectedStartAt?: unknown;
  expectedEndAt?: unknown;
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

function isExternalSyncedReservation(reservation: {
  source?: string | null;
  memo?: string | null;
}) {
  const source = (reservation.source || "").normalize("NFKC").toLowerCase();
  const memo = (reservation.memo || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

  return (
    source.includes("hpb") ||
    source.includes("hotpepper") ||
    source.includes("hot pepper") ||
    source.includes("minimo") ||
    source.includes("ミニモ") ||
    memo.includes("hpb予約番号") ||
    memo.includes("ミニモ予約id")
  );
}

function normalizeWorkflowStatus(status: string | null) {
  const normalized = String(status ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

  if (
    ["pending", "requested", "予約申請中", "予約受付", "予約"].includes(
      normalized,
    )
  ) {
    return "予約";
  }
  if (["confirmed", "予約確定"].includes(normalized)) return "confirmed";
  if (["来店予定", "来店", "完了待ち"].includes(normalized)) return "来店";
  if (["完了", "completed"].includes(normalized)) return "完了";
  if (CANCELLED_STATUSES.has(normalized)) return "キャンセル";

  return "";
}

function canTransitionWorkflowStatus(
  currentStatus: string | null,
  nextStatus: string,
) {
  const current = normalizeWorkflowStatus(currentStatus);
  const next = normalizeWorkflowStatus(nextStatus);

  if (!current || !next) return false;
  if (current === next) return true;
  if ((current === "予約" || current === "confirmed") && next === "来店") {
    return true;
  }
  if (current === "来店" && next === "完了") return true;
  if (
    next === "キャンセル" &&
    (current === "予約" || current === "confirmed")
  ) {
    return true;
  }

  return false;
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

function sameStoredDateTime(
  currentValue: string | null,
  expectedValue: string | null,
) {
  if (currentValue === null || expectedValue === null) {
    return currentValue === expectedValue;
  }

  const currentTime = new Date(currentValue).getTime();
  const expectedTime = new Date(expectedValue).getTime();

  return (
    Number.isFinite(currentTime) &&
    Number.isFinite(expectedTime) &&
    currentTime === expectedTime
  );
}

function matchesRequestedReservation(
  reservation: {
    salon_id: string | null;
    customer_id: string | null;
    staff_id: string | null;
    menu: string | null;
    start_at: string | null;
    end_at: string | null;
    status: string | null;
    memo: string | null;
  },
  requested: {
    salonId: string;
    customerId: string | null;
    staffId: string;
    menu: string | null;
    startAt: string;
    endAt: string;
    status: string;
    memo: string | null;
  },
) {
  return (
    reservation.salon_id === requested.salonId &&
    reservation.customer_id === requested.customerId &&
    reservation.staff_id === requested.staffId &&
    reservation.menu === requested.menu &&
    sameStoredDateTime(reservation.start_at, requested.startAt) &&
    sameStoredDateTime(reservation.end_at, requested.endAt) &&
    reservation.status === requested.status &&
    reservation.memo === requested.memo
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
      "id, salon_id, customer_id, staff_id, menu, start_at, end_at, status, source, memo, updated_at",
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
  const hasExpectedCustomerId = Object.prototype.hasOwnProperty.call(
    body,
    "expectedCustomerId",
  );
  const hasExpectedStaffId = Object.prototype.hasOwnProperty.call(
    body,
    "expectedStaffId",
  );
  const hasExpectedMenu = Object.prototype.hasOwnProperty.call(
    body,
    "expectedMenu",
  );
  const expectedCustomerId = body.expectedCustomerId;
  const expectedStaffId = body.expectedStaffId;
  const expectedMenu = body.expectedMenu;
  const hasExpectedMemo = Object.prototype.hasOwnProperty.call(
    body,
    "expectedMemo",
  );
  const expectedMemo = body.expectedMemo;
  const expectedStatus = body.expectedStatus;
  const hasExpectedStartAt = Object.prototype.hasOwnProperty.call(
    body,
    "expectedStartAt",
  );
  const hasExpectedEndAt = Object.prototype.hasOwnProperty.call(
    body,
    "expectedEndAt",
  );
  const expectedStartAt = body.expectedStartAt;
  const expectedEndAt = body.expectedEndAt;
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
    !hasExpectedCustomerId ||
    (expectedCustomerId !== null && typeof expectedCustomerId !== "string") ||
    !hasExpectedStaffId ||
    (expectedStaffId !== null && typeof expectedStaffId !== "string") ||
    !hasExpectedMenu ||
    (expectedMenu !== null && typeof expectedMenu !== "string") ||
    !hasExpectedMemo ||
    (expectedMemo !== null && typeof expectedMemo !== "string") ||
    typeof expectedStatus !== "string" ||
    !hasExpectedStartAt ||
    (expectedStartAt !== null && typeof expectedStartAt !== "string") ||
    !hasExpectedEndAt ||
    (expectedEndAt !== null && typeof expectedEndAt !== "string")
  ) {
    return errorResponse(
      "予約内容を読み直してから更新してください。",
      400,
    );
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

    const requestedReservation = {
      salonId,
      customerId,
      staffId,
      menu: menu || null,
      startAt,
      endAt,
      status,
      memo: memo || null,
    };

    if (isExternalSyncedReservation(reservationResult.data)) {
      return errorResponse(
        "HPB・ミニモから同期された予約は、予約元で変更してください。",
        409,
      );
    }

    if (
      reservationResult.data.customer_id !== expectedCustomerId ||
      reservationResult.data.staff_id !== expectedStaffId ||
      reservationResult.data.menu !== expectedMenu ||
      reservationResult.data.status !== expectedStatus ||
      reservationResult.data.memo !== expectedMemo ||
      !sameStoredDateTime(
        reservationResult.data.start_at,
        expectedStartAt,
      ) ||
      !sameStoredDateTime(reservationResult.data.end_at, expectedEndAt)
    ) {
      if (
        matchesRequestedReservation(
          reservationResult.data,
          requestedReservation,
        )
      ) {
        return NextResponse.json({
          ok: true,
          id: reservationResult.data.id,
          alreadyUpdated: true,
        });
      }

      return errorResponse(
        "予約内容が更新されています。最新の内容を読み込み直してください。",
        409,
      );
    }

    const nextStartTime = new Date(startAt).getTime();
    const currentStartTime = new Date(
      reservationResult.data.start_at || "",
    ).getTime();
    const activatesElapsedTime =
      ACTIVE_RESERVATION_STATUSES.has(normalizeWorkflowStatus(status)) &&
      nextStartTime <= Date.now() &&
      (!ACTIVE_RESERVATION_STATUSES.has(
        normalizeWorkflowStatus(reservationResult.data.status),
      ) || currentStartTime !== nextStartTime);

    if (activatesElapsedTime) {
      return errorResponse(
        "開始時刻を過ぎた日時へ予約を変更できません。日時を確認してください。",
        409,
      );
    }

    if (
      normalizeWorkflowStatus(status) === "confirmed" &&
      normalizeWorkflowStatus(reservationResult.data.status) !== "confirmed"
    ) {
      return errorResponse(
        "予約確定は『予約確定にする』から実行してください。",
        409,
      );
    }

    if (
      normalizeWorkflowStatus(status) === "キャンセル" &&
      reservationResult.data.customer_id !== null &&
      normalizeWorkflowStatus(reservationResult.data.status) !== "キャンセル"
    ) {
      return errorResponse(
        "顧客予約のキャンセルはキャンセル通知の確認画面から実行してください。",
        409,
      );
    }

    if (!canTransitionWorkflowStatus(reservationResult.data.status, status)) {
      return errorResponse(
        "現在の予約状態からは更新できません。最新の内容を確認してください。",
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

    if (normalizeWorkflowStatus(status) !== "キャンセル") {
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
          normalizeWorkflowStatus(reservation.status) !== "キャンセル",
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

    let updateQuery = supabase
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
      .eq("status", expectedStatus);

    updateQuery =
      expectedCustomerId === null
        ? updateQuery.is("customer_id", null)
        : updateQuery.eq("customer_id", expectedCustomerId);
    updateQuery =
      expectedStaffId === null
        ? updateQuery.is("staff_id", null)
        : updateQuery.eq("staff_id", expectedStaffId);
    updateQuery =
      expectedMenu === null
        ? updateQuery.is("menu", null)
        : updateQuery.eq("menu", expectedMenu);
    updateQuery =
      expectedMemo === null
        ? updateQuery.is("memo", null)
        : updateQuery.eq("memo", expectedMemo);
    updateQuery =
      expectedStartAt === null
        ? updateQuery.is("start_at", null)
        : updateQuery.eq("start_at", expectedStartAt);
    updateQuery =
      expectedEndAt === null
        ? updateQuery.is("end_at", null)
        : updateQuery.eq("end_at", expectedEndAt);

    const updateResult = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateResult.error) return internalErrorResponse();
    if (!updateResult.data) {
      const latestReservationResult = await findReservation(
        supabase,
        reservationId,
        authentication.principal.authenticationMode === "supabase"
          ? salonId
          : null,
      );

      if (latestReservationResult.error) return internalErrorResponse();
      if (
        latestReservationResult.data &&
        !isExternalSyncedReservation(latestReservationResult.data) &&
        matchesRequestedReservation(
          latestReservationResult.data,
          requestedReservation,
        )
      ) {
        return NextResponse.json({
          ok: true,
          id: latestReservationResult.data.id,
          alreadyUpdated: true,
        });
      }

      return errorResponse(
        "予約内容が更新されています。最新の内容を読み込み直してください。",
        409,
      );
    }

    return NextResponse.json({ ok: true, id: updateResult.data.id });
  } catch {
    return internalErrorResponse();
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  const { id: reservationId } = await context.params;

  if (!validUuid(reservationId)) {
    return errorResponse("予約IDを確認してください。", 400);
  }

  let body: EditReservationBody;

  try {
    body = (await request.json()) as EditReservationBody;
  } catch {
    return errorResponse("予約内容を読み直してから削除してください。", 400);
  }

  const hasExpectedCustomerId = Object.prototype.hasOwnProperty.call(
    body,
    "expectedCustomerId",
  );
  const hasExpectedStaffId = Object.prototype.hasOwnProperty.call(
    body,
    "expectedStaffId",
  );
  const hasExpectedMenu = Object.prototype.hasOwnProperty.call(
    body,
    "expectedMenu",
  );
  const hasExpectedMemo = Object.prototype.hasOwnProperty.call(
    body,
    "expectedMemo",
  );
  const hasExpectedStartAt = Object.prototype.hasOwnProperty.call(
    body,
    "expectedStartAt",
  );
  const hasExpectedEndAt = Object.prototype.hasOwnProperty.call(
    body,
    "expectedEndAt",
  );
  const expectedCustomerId = body.expectedCustomerId;
  const expectedStaffId = body.expectedStaffId;
  const expectedMenu = body.expectedMenu;
  const expectedStatus = body.expectedStatus;
  const expectedMemo = body.expectedMemo;
  const expectedStartAt = body.expectedStartAt;
  const expectedEndAt = body.expectedEndAt;

  if (
    !hasExpectedCustomerId ||
    (expectedCustomerId !== null && typeof expectedCustomerId !== "string") ||
    !hasExpectedStaffId ||
    (expectedStaffId !== null && typeof expectedStaffId !== "string") ||
    !hasExpectedMenu ||
    (expectedMenu !== null && typeof expectedMenu !== "string") ||
    (expectedStatus !== null && typeof expectedStatus !== "string") ||
    !hasExpectedMemo ||
    (expectedMemo !== null && typeof expectedMemo !== "string") ||
    !hasExpectedStartAt ||
    (expectedStartAt !== null && typeof expectedStartAt !== "string") ||
    !hasExpectedEndAt ||
    (expectedEndAt !== null && typeof expectedEndAt !== "string")
  ) {
    return errorResponse("予約内容を読み直してから削除してください。", 400);
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
      return NextResponse.json({
        ok: true,
        id: reservationId,
        alreadyDeleted: true,
      });
    }

    if (
      reservationResult.data.customer_id !== expectedCustomerId ||
      reservationResult.data.staff_id !== expectedStaffId ||
      reservationResult.data.menu !== expectedMenu ||
      reservationResult.data.status !== expectedStatus ||
      reservationResult.data.memo !== expectedMemo ||
      !sameStoredDateTime(
        reservationResult.data.start_at,
        expectedStartAt,
      ) ||
      !sameStoredDateTime(reservationResult.data.end_at, expectedEndAt)
    ) {
      return errorResponse(
        "予約内容が更新されています。最新の内容を読み込み直してください。",
        409,
      );
    }

    if (isExternalSyncedReservation(reservationResult.data)) {
      return errorResponse(
        "HPB・ミニモから同期された予約は、予約元で変更・キャンセルしてください。",
        409,
      );
    }

    let deleteQuery = supabase
      .from("reservations")
      .delete()
      .eq("id", reservationId)
      .eq("salon_id", reservationResult.data.salon_id);

    deleteQuery =
      expectedStatus === null
        ? deleteQuery.is("status", null)
        : deleteQuery.eq("status", expectedStatus);
    deleteQuery =
      expectedCustomerId === null
        ? deleteQuery.is("customer_id", null)
        : deleteQuery.eq("customer_id", expectedCustomerId);
    deleteQuery =
      expectedStaffId === null
        ? deleteQuery.is("staff_id", null)
        : deleteQuery.eq("staff_id", expectedStaffId);
    deleteQuery =
      expectedMenu === null
        ? deleteQuery.is("menu", null)
        : deleteQuery.eq("menu", expectedMenu);
    deleteQuery =
      expectedMemo === null
        ? deleteQuery.is("memo", null)
        : deleteQuery.eq("memo", expectedMemo);
    deleteQuery =
      expectedStartAt === null
        ? deleteQuery.is("start_at", null)
        : deleteQuery.eq("start_at", expectedStartAt);
    deleteQuery =
      expectedEndAt === null
        ? deleteQuery.is("end_at", null)
        : deleteQuery.eq("end_at", expectedEndAt);

    const deleteResult = await deleteQuery
      .select("id")
      .maybeSingle();

    if (deleteResult.error) return internalErrorResponse();
    if (!deleteResult.data) {
      const remainingReservation = await findReservation(
        supabase,
        reservationId,
        salonId,
      );

      if (remainingReservation.error) return internalErrorResponse();
      if (!remainingReservation.data) {
        return NextResponse.json({
          ok: true,
          id: reservationId,
          alreadyDeleted: true,
        });
      }

      return errorResponse(
        "予約内容が更新されています。最新の内容を読み込み直してください。",
        409,
      );
    }

    return NextResponse.json({ ok: true, id: deleteResult.data.id });
  } catch {
    return internalErrorResponse();
  }
}
