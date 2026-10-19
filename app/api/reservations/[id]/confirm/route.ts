import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type ReservationRow = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  memo: string | null;
};

type ConfirmReservationBody = {
  customerId?: string | null;
  staffId?: string | null;
  menu?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  memo?: string | null;
};

type ConfirmReservationRow = {
  outcome: string;
  reservation_id: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase環境変数が不足しています");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function parseOptionalString(
  body: Record<string, unknown>,
  key: keyof ConfirmReservationBody
) {
  if (!(key in body)) return { provided: false as const, value: null };

  const value = body[key];
  if (value !== null && typeof value !== "string") return null;

  return {
    provided: true as const,
    value: typeof value === "string" ? value.trim() || null : null,
  };
}

function getConfirmReservationRow(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;

  if (!row || typeof row !== "object") return null;

  const candidate = row as Record<string, unknown>;
  if (
    typeof candidate.outcome !== "string" ||
    (candidate.reservation_id !== null &&
      typeof candidate.reservation_id !== "string")
  ) {
    return null;
  }

  return candidate as ConfirmReservationRow;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: false,
    salonContextRequired: true,
  });

  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, confirmed: false, error: authentication.error },
      { status: authentication.status }
    );
  }

  if (authentication.principal.authenticationMode !== "supabase") {
    return NextResponse.json(
      {
        ok: false,
        confirmed: false,
        error: "この予約を操作する権限がありません。",
      },
      { status: 403 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    rawBody = {};
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json(
      { ok: false, confirmed: false, error: "予約内容が正しくありません。" },
      { status: 400 }
    );
  }

  const body = rawBody as Record<string, unknown>;
  const parsedFields = {
    customerId: parseOptionalString(body, "customerId"),
    staffId: parseOptionalString(body, "staffId"),
    menu: parseOptionalString(body, "menu"),
    startAt: parseOptionalString(body, "startAt"),
    endAt: parseOptionalString(body, "endAt"),
    memo: parseOptionalString(body, "memo"),
  };

  if (Object.values(parsedFields).some((field) => field === null)) {
    return NextResponse.json(
      { ok: false, confirmed: false, error: "予約内容が正しくありません。" },
      { status: 400 }
    );
  }

  try {
    const { id: reservationId } = await context.params;
    const salonId = authentication.principal.salonId;
    const supabaseAdmin = getSupabaseAdmin();
    const { data: reservationData, error: reservationError } =
      await supabaseAdmin
        .from("reservations")
        .select(
          "id, salon_id, customer_id, staff_id, menu, start_at, end_at, status, memo"
        )
        .eq("id", reservationId)
        .eq("salon_id", salonId)
        .maybeSingle();

    if (reservationError) {
      throw new Error(reservationError.message);
    }

    if (!reservationData) {
      return NextResponse.json(
        { ok: false, confirmed: false, error: "予約が見つかりません。" },
        { status: 404 }
      );
    }

    const reservation = reservationData as ReservationRow;
    const customerId = parsedFields.customerId!.provided
      ? parsedFields.customerId!.value
      : reservation.customer_id;
    const staffId = parsedFields.staffId!.provided
      ? parsedFields.staffId!.value
      : reservation.staff_id;
    const menu = parsedFields.menu!.provided
      ? parsedFields.menu!.value
      : reservation.menu;
    const startAt = parsedFields.startAt!.provided
      ? parsedFields.startAt!.value
      : reservation.start_at;
    const endAt = parsedFields.endAt!.provided
      ? parsedFields.endAt!.value
      : reservation.end_at;
    const memo = parsedFields.memo!.provided
      ? parsedFields.memo!.value
      : reservation.memo;

    if (!staffId || !menu || !startAt || !endAt) {
      return NextResponse.json(
        {
          ok: false,
          confirmed: false,
          error: "担当者・メニュー・予約日時を確認してください。",
        },
        { status: 400 }
      );
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return NextResponse.json(
        { ok: false, confirmed: false, error: "予約日時が正しくありません。" },
        { status: 400 }
      );
    }

    if (startDate.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          ok: false,
          confirmed: false,
          error:
            "開始時刻を過ぎた予約は確定できません。別の日時を案内してください。",
        },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "confirm_staff_reservation",
      {
        p_reservation_id: reservation.id,
        p_salon_id: salonId,
        p_expected_start_at: reservation.start_at,
        p_expected_end_at: reservation.end_at,
        p_customer_id: customerId,
        p_staff_id: staffId,
        p_menu: menu,
        p_start_at: startAt,
        p_end_at: endAt,
        p_memo: memo || "",
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    const result = getConfirmReservationRow(data);
    if (!result) {
      throw new Error("予約確定処理の結果が正しくありません");
    }

    if (result.outcome === "confirmed" && result.reservation_id) {
      return NextResponse.json({
        ok: true,
        confirmed: true,
        alreadyConfirmed: false,
        reservationId: result.reservation_id,
      });
    }

    if (result.outcome === "already_confirmed") {
      return NextResponse.json({
        ok: true,
        confirmed: false,
        alreadyConfirmed: true,
        reservationId: result.reservation_id,
        message: "この予約は既に確定済みです。LINEは再送していません。",
      });
    }

    const outcomeResponses: Record<string, { status: number; error: string }> = {
      slot_unavailable: {
        status: 409,
        error:
          "この時間帯には別の予約またはブロックがあります。最新のカレンダーを確認してください。",
      },
      stale: {
        status: 409,
        error: "予約内容が更新されています。最新の内容を読み込み直してください。",
      },
      invalid_staff: {
        status: 409,
        error: "担当者の予約受付設定を確認してください。",
      },
      invalid_customer: {
        status: 409,
        error: "顧客情報と店舗情報が一致しません。",
      },
      invalid_input: {
        status: 400,
        error: "予約内容が正しくありません。",
      },
      not_found: { status: 404, error: "予約が見つかりません。" },
    };
    const response = outcomeResponses[result.outcome] || {
      status: 409,
      error: "予約を確定できませんでした。最新の内容を確認してください。",
    };

    return NextResponse.json(
      { ok: false, confirmed: false, error: response.error },
      { status: response.status }
    );
  } catch (error) {
    console.error("confirm-reservation error:", error);
    return NextResponse.json(
      {
        ok: false,
        confirmed: false,
        error: "予約確定処理でエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
