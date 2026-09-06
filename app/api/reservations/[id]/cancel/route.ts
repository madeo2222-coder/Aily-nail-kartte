import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type CancellationReason =
  | "overlap"
  | "customer_request"
  | "salon_convenience"
  | "other";

type CancelReservationBody = {
  sendLine: boolean;
  reason: CancellationReason;
  reasonText?: string;
};

type ReservationRow = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  start_at: string | null;
  status: string | null;
};

const CANCELLATION_REASONS: Record<CancellationReason, string> = {
  overlap: "予約枠の重複",
  customer_request: "お客様のご都合",
  salon_convenience: "店舗の都合",
  other: "その他",
};

const LINE_REQUEST_TIMEOUT_MS = 10_000;

function isCancellationReason(value: string): value is CancellationReason {
  return Object.prototype.hasOwnProperty.call(CANCELLATION_REASONS, value);
}

function parseCancelReservationBody(
  value: unknown
):
  | { ok: true; body: CancelReservationBody }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "キャンセル内容が正しくありません。" };
  }

  const body = value as Record<string, unknown>;

  if (body.sendLine !== undefined && typeof body.sendLine !== "boolean") {
    return { ok: false, error: "キャンセル内容が正しくありません。" };
  }

  if (typeof body.reason !== "string" || !isCancellationReason(body.reason)) {
    return { ok: false, error: "キャンセル内容が正しくありません。" };
  }

  if (body.reasonText !== undefined && typeof body.reasonText !== "string") {
    return { ok: false, error: "キャンセル内容が正しくありません。" };
  }

  const reasonText = body.reasonText?.trim() ?? "";

  if (reasonText.length > 200) {
    return {
      ok: false,
      error: "キャンセル理由は200文字以内で入力してください。",
    };
  }

  if (body.reason === "other" && !reasonText) {
    return { ok: false, error: "キャンセル理由を入力してください。" };
  }

  return {
    ok: true,
    body: {
      sendLine: body.sendLine ?? false,
      reason: body.reason,
      reasonText,
    },
  };
}

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

function isCancelledStatus(status: string | null) {
  return status === "キャンセル" || status === "cancelled";
}

function formatReservationDate(value: string | null) {
  if (!value) return "日時未設定";

  const normalized =
    /[zZ]$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)
      ? value
      : `${value.includes("T") ? value : value.replace(" ", "T")}Z`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return "日時未設定";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildCancellationMessage(params: {
  customerName: string;
  salonName: string;
  startAt: string | null;
  reason: CancellationReason;
  reasonText: string;
}) {
  const reasonLabel =
    params.reason === "other" && params.reasonText
      ? params.reasonText
      : CANCELLATION_REASONS[params.reason];
  const dateText = formatReservationDate(params.startAt);

  if (params.reason === "overlap") {
    return `${params.customerName}様
${params.salonName}です。
ご予約いただいた${dateText}からのご予約につきまして、予約枠の重複が確認されたため、誠に申し訳ございませんが一度キャンセルとさせていただきました。
お手数ですが、別の日時で再度ご予約をお願いいたします。
ご迷惑をおかけし、誠に申し訳ございません。`;
  }

  return `${params.customerName}様
${params.salonName}です。
ご予約いただいた${dateText}からのご予約につきまして、誠に申し訳ございませんがキャンセルとさせていただきました。
理由：${reasonLabel}
ご不明な点がございましたら、店舗までお問い合わせください。`;
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
      { ok: false, error: authentication.error },
      { status: authentication.status }
    );
  }

  if (authentication.principal.authenticationMode !== "supabase") {
    return NextResponse.json(
      { ok: false, error: "この予約を操作する権限がありません。" },
      { status: 403 }
    );
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "キャンセル内容が正しくありません。" },
      { status: 400 }
    );
  }

  const parsedBody = parseCancelReservationBody(requestBody);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { ok: false, error: parsedBody.error },
      { status: 400 }
    );
  }

  try {
    const { id: reservationId } = await context.params;
    const { sendLine, reason, reasonText = "" } = parsedBody.body;

    if (!reservationId) {
      return NextResponse.json(
        { ok: false, error: "キャンセル内容が正しくありません。" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: reservationData, error: reservationError } = await supabaseAdmin
      .from("reservations")
      .select("id, salon_id, customer_id, start_at, status")
      .eq("id", reservationId)
      .maybeSingle();

    if (reservationError) {
      return NextResponse.json(
        { ok: false, error: "予約情報の確認に失敗しました。" },
        { status: 500 }
      );
    }

    if (!reservationData) {
      return NextResponse.json(
        { ok: false, error: "予約が見つかりません。" },
        { status: 404 }
      );
    }

    const reservation = reservationData as ReservationRow;

    if (!reservation.salon_id) {
      return NextResponse.json(
        { ok: false, error: "予約の店舗情報を確認できません。" },
        { status: 409 }
      );
    }

    if (authentication.principal.salonId !== reservation.salon_id) {
      return NextResponse.json(
        { ok: false, error: "この予約を操作する権限がありません。" },
        { status: 403 }
      );
    }

    if (isCancelledStatus(reservation.status)) {
      return NextResponse.json({
        ok: true,
        cancelled: false,
        alreadyCancelled: true,
        line: {
          status: "skipped",
          message: "既にキャンセル済みのため、LINEは再送していません。",
        },
      });
    }

    let updateQuery = supabaseAdmin
      .from("reservations")
      .update({ status: "キャンセル" })
      .eq("id", reservation.id)
      .eq("salon_id", reservation.salon_id);

    updateQuery = reservation.status
      ? updateQuery.eq("status", reservation.status)
      : updateQuery.is("status", null);

    const { data: updatedReservation, error: updateError } = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: "予約のキャンセルに失敗しました。" },
        { status: 500 }
      );
    }

    if (!updatedReservation) {
      return NextResponse.json({
        ok: true,
        cancelled: false,
        alreadyCancelled: true,
        line: {
          status: "skipped",
          message: "予約状態が既に変更されているため、LINEは送信していません。",
        },
      });
    }

    if (!sendLine) {
      return NextResponse.json({
        ok: true,
        cancelled: true,
        line: { status: "skipped", message: "LINE通知は送信しませんでした。" },
      });
    }

    if (!reservation.customer_id) {
      return NextResponse.json({
        ok: true,
        cancelled: true,
        line: {
          status: "not_linked",
          message: "顧客情報がないため、LINE通知は送信できませんでした。",
        },
      });
    }

    const [customerResult, salonResult] = await Promise.all([
      supabaseAdmin
        .from("customers")
        .select("id, name, salon_id, line_user_id")
        .eq("id", reservation.customer_id)
        .eq("salon_id", reservation.salon_id)
        .maybeSingle(),
      supabaseAdmin
        .from("salons")
        .select("id, name")
        .eq("id", reservation.salon_id)
        .maybeSingle(),
    ]);

    if (customerResult.error || salonResult.error) {
      return NextResponse.json({
        ok: true,
        cancelled: true,
        line: {
          status: "failed",
          message: "予約はキャンセルしましたが、LINE送信情報を確認できませんでした。",
        },
      });
    }

    const customer = customerResult.data;
    const salon = salonResult.data;

    if (!customer || !salon) {
      return NextResponse.json({
        ok: true,
        cancelled: true,
        line: {
          status: "failed",
          message: "予約はキャンセルしましたが、予約と顧客の所属関係を確認できませんでした。",
        },
      });
    }

    if (!customer.line_user_id) {
      return NextResponse.json({
        ok: true,
        cancelled: true,
        line: {
          status: "not_linked",
          message: "予約はキャンセルしました。顧客はLINE未連携のため通知していません。",
        },
      });
    }

    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) {
      return NextResponse.json({
        ok: true,
        cancelled: true,
        line: {
          status: "failed",
          message: "予約はキャンセルしましたが、LINE通知の送信に失敗しました。",
        },
      });
    }

    const messageText = buildCancellationMessage({
      customerName: customer.name?.trim() || "お客様",
      salonName: salon.name?.trim() || "Aily Nail Studio",
      startAt: reservation.start_at,
      reason,
      reasonText,
    });

    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      LINE_REQUEST_TIMEOUT_MS
    );

    try {
      const lineResponse = await fetch(
        "https://api.line.me/v2/bot/message/push",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${channelAccessToken}`,
          },
          body: JSON.stringify({
            to: customer.line_user_id,
            messages: [{ type: "text", text: messageText }],
          }),
          signal: abortController.signal,
        }
      );

      if (!lineResponse.ok) {
        return NextResponse.json({
          ok: true,
          cancelled: true,
          line: {
            status: "failed",
            message:
              "予約はキャンセルしましたが、LINE通知の送信に失敗しました。",
          },
        });
      }
    } catch {
      return NextResponse.json({
        ok: true,
        cancelled: true,
        line: {
          status: "failed",
          message: "予約はキャンセルしましたが、LINE通知の送信に失敗しました。",
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    return NextResponse.json({
      ok: true,
      cancelled: true,
      line: {
        status: "sent",
        message: "予約をキャンセルし、顧客へLINE通知を送信しました。",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "予約のキャンセル処理に失敗しました。" },
      { status: 500 }
    );
  }
}
