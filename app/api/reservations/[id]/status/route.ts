import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["来店", "完了"]);
const VISITABLE_STATUSES = new Set([
  "pending",
  "requested",
  "予約申請中",
  "予約受付",
  "予約",
  "予約確定",
  "confirmed",
]);
const COMPLETABLE_STATUSES = new Set(["来店予定", "来店", "完了待ち"]);

function normalizeWorkflowStatus(status: string | null) {
  return String(status ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function canTransitionReservationStatus(
  currentStatus: string | null,
  nextStatus: string,
) {
  const current = normalizeWorkflowStatus(currentStatus);

  if (nextStatus === "来店") {
    return (
      VISITABLE_STATUSES.has(current) || COMPLETABLE_STATUSES.has(current)
    );
  }

  if (nextStatus === "完了") {
    return COMPLETABLE_STATUSES.has(current);
  }

  return false;
}

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });

  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, error: authentication.error },
      { status: authentication.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const bodyRecord =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  const status = bodyRecord?.status;
  const expectedStatus = bodyRecord?.expectedStatus;
  const expectedCustomerId = bodyRecord?.expectedCustomerId;
  const hasExpectedStatus = bodyRecord
    ? Object.prototype.hasOwnProperty.call(bodyRecord, "expectedStatus")
    : false;
  const hasExpectedCustomerId = bodyRecord
    ? Object.prototype.hasOwnProperty.call(bodyRecord, "expectedCustomerId")
    : false;

  if (
    typeof status !== "string" ||
    !ALLOWED_STATUSES.has(status)
  ) {
    return NextResponse.json(
      { ok: false, error: "予約ステータスが正しくありません。" },
      { status: 400 },
    );
  }

  if (
    !hasExpectedStatus ||
    (expectedStatus !== null && typeof expectedStatus !== "string") ||
    !hasExpectedCustomerId ||
    (expectedCustomerId !== null && typeof expectedCustomerId !== "string")
  ) {
    return NextResponse.json(
      { ok: false, error: "予約内容を読み直してから更新してください。" },
      { status: 400 },
    );
  }

  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    let reservationQuery = supabase
      .from("reservations")
      .select("id, customer_id, status")
      .eq("id", id);

    if (authentication.principal.authenticationMode === "supabase") {
      reservationQuery = reservationQuery.eq(
        "salon_id",
        authentication.principal.salonId,
      );
    }

    const reservationResult = await reservationQuery.maybeSingle();

    if (reservationResult.error) throw reservationResult.error;

    if (!reservationResult.data) {
      return NextResponse.json(
        { ok: false, error: "予約が見つかりません。" },
        { status: 404 },
      );
    }

    if (
      reservationResult.data.status !== expectedStatus ||
      reservationResult.data.customer_id !== expectedCustomerId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約内容が更新されています。最新の内容を読み込み直してください。",
        },
        { status: 409 },
      );
    }

    if (
      !canTransitionReservationStatus(
        reservationResult.data.status,
        status,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "現在の予約状態からは更新できません。最新の内容を確認してください。",
        },
        { status: 409 },
      );
    }

    if (status === "来店") {
      let existingVisitQuery = supabase
        .from("visits")
        .select("id")
        .eq("reservation_id", id)
        .limit(1);

      if (authentication.principal.authenticationMode === "supabase") {
        existingVisitQuery = existingVisitQuery.eq(
          "salon_id",
          authentication.principal.salonId,
        );
      }

      const existingVisitResult = await existingVisitQuery.maybeSingle();

      if (existingVisitResult.error) throw existingVisitResult.error;

      if (existingVisitResult.data) {
        return NextResponse.json(
          { ok: false, error: "この予約には既に来店履歴があります。" },
          { status: 409 },
        );
      }
    }

    let updateQuery = supabase
      .from("reservations")
      .update({ status })
      .eq("id", id);

    if (authentication.principal.authenticationMode === "supabase") {
      updateQuery = updateQuery.eq(
        "salon_id",
        authentication.principal.salonId,
      );
    }

    updateQuery =
      expectedStatus === null
        ? updateQuery.is("status", null)
        : updateQuery.eq("status", expectedStatus);

    updateQuery =
      expectedCustomerId === null
        ? updateQuery.is("customer_id", null)
        : updateQuery.eq("customer_id", expectedCustomerId);

    const { data, error } = await updateQuery
      .select("id, status")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約内容が更新されています。最新の内容を読み込み直してください。",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, reservation: data });
  } catch {
    return NextResponse.json(
      { ok: false, error: "予約ステータスの更新に失敗しました。" },
      { status: 500 },
    );
  }
}
