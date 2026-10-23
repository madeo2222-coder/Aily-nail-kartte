import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["来店", "完了"]);

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
  const hasExpectedStatus = bodyRecord
    ? Object.prototype.hasOwnProperty.call(bodyRecord, "expectedStatus")
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
    (expectedStatus !== null && typeof expectedStatus !== "string")
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
      .select("id, status")
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

    if (reservationResult.data.status !== expectedStatus) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約内容が更新されています。最新の内容を読み込み直してください。",
        },
        { status: 409 },
      );
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
