import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type SendReservationConfirmedLineBody = { reservationId?: string };
type ReservationRow = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  staff_id: string | null;
  status: string | null;
  menu: string | null;
  start_at: string | null;
  end_at: string | null;
};
type CustomerRow = {
  id: string;
  name: string | null;
  salon_id: string | null;
  line_user_id: string | null;
};
type NamedRow = { id: string; name: string | null };
type ClaimRow = {
  claim_status: "claimed" | "already_sent" | "in_progress" | "retry_expired";
  attempt_count: number;
  line_retry_key: string;
  line_message: string;
};
type ClaimFailure = {
  httpStatus: 403 | 409;
  deliveryStatus?: "message_changed" | "reservation_changed";
  error: string;
};

const LINE_REQUEST_TIMEOUT_MS = 10_000;

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

function normalizeSupabaseDateTime(value: string | null) {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return `${trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T")}Z`;
}

function formatDateTime(value: string | null) {
  const normalizedValue = normalizeSupabaseDateTime(value);
  if (!normalizedValue) return "未設定";
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatTimeOnly(value: string | null) {
  const normalizedValue = normalizeSupabaseDateTime(value);
  if (!normalizedValue) return "";
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildLineMessage(params: {
  customerName: string;
  salonName: string;
  menuName: string;
  staffName: string;
  startAt: string;
}) {
  return `${params.customerName}様

ご予約が確定しました💅

【予約内容】
サロン：${params.salonName}
日時：${params.startAt}
メニュー：${params.menuName}
担当：${params.staffName}

ご来店を心よりお待ちしております。`;
}

function getClaimRow(value: unknown): ClaimRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  if (
    typeof candidate.claim_status !== "string" ||
    typeof candidate.attempt_count !== "number" ||
    typeof candidate.line_retry_key !== "string" ||
    typeof candidate.line_message !== "string"
  ) return null;
  if (
    candidate.claim_status !== "claimed" &&
    candidate.claim_status !== "already_sent" &&
    candidate.claim_status !== "in_progress" &&
    candidate.claim_status !== "retry_expired"
  ) return null;
  return candidate as ClaimRow;
}

function getClaimFailure(message: string): ClaimFailure | null {
  if (
    message.includes("CONFIRMATION_DELIVERY_INVALID_STAFF") ||
    message.includes("CONFIRMATION_DELIVERY_SCOPE_MISMATCH")
  ) {
    return {
      httpStatus: 403,
      error: "この予約を操作する権限がありません。",
    };
  }

  if (message.includes("CONFIRMATION_DELIVERY_INVALID_RESERVATION")) {
    return {
      httpStatus: 409,
      deliveryStatus: "reservation_changed",
      error: "予約状態が更新されています。最新の内容を読み込み直してください。",
    };
  }

  if (message.includes("CONFIRMATION_DELIVERY_MESSAGE_CHANGED")) {
    return {
      httpStatus: 409,
      deliveryStatus: "message_changed",
      error:
        "前回の送信試行後に予約内容が変わっています。LINE送信履歴を確認してください。",
    };
  }

  return null;
}

export async function POST(request: Request) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: false,
    salonContextRequired: true,
  });
  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, sent: false, error: authentication.error },
      { status: authentication.status }
    );
  }
  if (authentication.principal.authenticationMode !== "supabase") {
    return NextResponse.json(
      { ok: false, sent: false, error: "この予約を操作する権限がありません。" },
      { status: 403 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error:
          "予約内容を読み取れませんでした。画面を再読み込みしてから再試行してください。",
      },
      { status: 400 }
    );
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json(
      { ok: false, sent: false, error: "予約内容が正しくありません。" },
      { status: 400 }
    );
  }

  const body = rawBody as SendReservationConfirmedLineBody;
  if (typeof body.reservationId !== "string") {
    return NextResponse.json(
      { ok: false, sent: false, error: "予約IDがありません。" },
      { status: 400 }
    );
  }

  const reservationId = body.reservationId.trim();
  if (!reservationId) {
    return NextResponse.json(
      { ok: false, sent: false, error: "予約IDがありません。" },
      { status: 400 }
    );
  }

  try {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) {
      return NextResponse.json(
        { ok: false, sent: false, error: "LINE送信設定がありません。" },
        { status: 500 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: reservationData, error: reservationError } = await supabaseAdmin
      .from("reservations")
      .select("id, salon_id, customer_id, staff_id, status, menu, start_at, end_at")
      .eq("id", reservationId)
      .maybeSingle();
    if (reservationError) throw new Error(reservationError.message);
    if (!reservationData) {
      return NextResponse.json(
        { ok: false, sent: false, error: "予約が見つかりません。" },
        { status: 404 }
      );
    }

    const reservation = reservationData as ReservationRow;
    if (reservation.salon_id !== authentication.principal.salonId) {
      return NextResponse.json(
        { ok: false, sent: false, error: "この予約を操作する権限がありません。" },
        { status: 403 }
      );
    }
    if (reservation.status !== "confirmed" && reservation.status !== "予約確定") {
      return NextResponse.json(
        { ok: false, sent: false, error: "予約確定済みの予約ではありません。" },
        { status: 409 }
      );
    }
    if (!reservation.customer_id || !reservation.salon_id) {
      return NextResponse.json(
        { ok: false, sent: false, error: "予約に顧客またはサロンが紐付いていません。" },
        { status: 409 }
      );
    }

    const [customerResult, staffResult, salonResult] = await Promise.all([
      supabaseAdmin
        .from("customers")
        .select("id, name, salon_id, line_user_id")
        .eq("id", reservation.customer_id)
        .eq("salon_id", reservation.salon_id)
        .maybeSingle(),
      reservation.staff_id
        ? supabaseAdmin
            .from("staffs")
            .select("id, name")
            .eq("id", reservation.staff_id)
            .eq("salon_id", reservation.salon_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("salons")
        .select("id, name")
        .eq("id", reservation.salon_id)
        .maybeSingle(),
    ]);
    if (customerResult.error || staffResult.error || salonResult.error) {
      throw new Error(
        customerResult.error?.message || staffResult.error?.message ||
          salonResult.error?.message || "予約情報の確認に失敗しました"
      );
    }
    if (!customerResult.data) {
      return NextResponse.json(
        { ok: false, sent: false, error: "予約の顧客情報を確認できません。" },
        { status: 409 }
      );
    }

    const customer = customerResult.data as CustomerRow;
    const staff = (staffResult.data || null) as NamedRow | null;
    const salon = (salonResult.data || null) as NamedRow | null;
    if (!customer.line_user_id) {
      return NextResponse.json(
        { ok: false, sent: false, status: "not_linked", error: "顧客がLINE連携していないため送信できません。" },
        { status: 409 }
      );
    }

    const endAtText = formatTimeOnly(reservation.end_at);
    const startAtText = formatDateTime(reservation.start_at);
    const message = buildLineMessage({
      customerName: customer.name?.trim() || "お客様",
      salonName: salon?.name?.trim() || "Aily Nail Studio",
      menuName: reservation.menu?.trim() || "メニュー未設定",
      staffName: staff?.name?.trim() || "指名なし",
      startAt: endAtText ? `${startAtText} 〜 ${endAtText}` : startAtText,
    });

    const { data: claimData, error: claimError } = await supabaseAdmin.rpc(
      "claim_reservation_confirmation_delivery",
      {
        p_reservation_id: reservation.id,
        p_customer_id: customer.id,
        p_salon_id: reservation.salon_id,
        p_requested_by_staff_id: authentication.principal.staffId,
        p_message: message,
      }
    );
    if (claimError) {
      const claimFailure = getClaimFailure(claimError.message);

      if (claimFailure) {
        return NextResponse.json(
          {
            ok: false,
            sent: false,
            status: claimFailure.deliveryStatus,
            error: claimFailure.error,
          },
          { status: claimFailure.httpStatus }
        );
      }
      throw new Error(claimError.message);
    }

    const claim = getClaimRow(claimData);
    if (!claim) throw new Error("通知送信状態を確認できません");
    if (claim.claim_status === "already_sent") {
      return NextResponse.json({ ok: true, sent: false, alreadySent: true, message: "予約確定LINEは送信済みです。重複送信していません。" });
    }
    if (claim.claim_status === "in_progress") {
      return NextResponse.json(
        { ok: false, sent: false, status: "in_progress", error: "別の送信処理が進行中です。しばらくしてから確認してください。" },
        { status: 409 }
      );
    }
    if (claim.claim_status === "retry_expired") {
      return NextResponse.json(
        { ok: false, sent: false, status: "retry_expired", error: "安全に再送できる時間を過ぎています。LINEの送信履歴を確認してください。" },
        { status: 409 }
      );
    }

    let lineResponse: Response;
    try {
      lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
          "Content-Type": "application/json",
          "X-Line-Retry-Key": claim.line_retry_key,
        },
        body: JSON.stringify({
          to: customer.line_user_id,
          messages: [{ type: "text", text: claim.line_message }],
        }),
        signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "LINE APIへの接続に失敗しました";
      let failureRecorded = false;
      try {
        const { data, error: completionError } = await supabaseAdmin.rpc(
          "complete_reservation_confirmation_delivery",
          {
            p_reservation_id: reservation.id,
            p_attempt_count: claim.attempt_count,
            p_status: "failed",
            p_error: errorMessage,
          }
        );
        failureRecorded = !completionError && data === true;
      } catch {
        // A lost LINE response and an unrecorded failure leave delivery unknown.
        // Do not turn this into a confirmed failure or invite an immediate retry.
      }

      if (!failureRecorded) {
        return NextResponse.json(
          {
            ok: false,
            sent: false,
            status: "unknown",
            retryable: false,
            error: "LINE送信結果を保存できませんでした。再送せず、通知状態とLINEの送信履歴を確認してください。",
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { ok: false, sent: false, status: "failed", retryable: true, error: "LINE送信に失敗しました。確定済み予約から再試行できます。" },
        { status: 502 }
      );
    }

    const acceptedRetry = lineResponse.status === 409 &&
      Boolean(lineResponse.headers.get("x-line-accepted-request-id")?.trim());
    const accepted = lineResponse.ok || acceptedRetry;
    const lineErrorText = accepted ? "" : (
      await lineResponse.text().catch(() => `LINE API HTTP ${lineResponse.status}: response body unavailable`)
    ).slice(0, 1000);
    let completionRecorded = false;
    try {
      const { data: completed, error: completionError } =
        await supabaseAdmin.rpc(
          "complete_reservation_confirmation_delivery",
          {
            p_reservation_id: reservation.id,
            p_attempt_count: claim.attempt_count,
            p_status: accepted ? "sent" : "failed",
            p_error: lineErrorText || null,
          }
        );
      completionRecorded = !completionError && completed === true;
    } catch {
      // The LINE response is known, but its delivery ledger could not be updated.
    }
    if (!completionRecorded) {
      return NextResponse.json(
        {
          ok: false,
          sent: accepted,
          status: accepted ? "sent_unrecorded" : "unknown",
          retryable: false,
          error: accepted
            ? "LINEは送信されましたが送信記録を保存できませんでした。再送せず、通知状態とLINEの送信履歴を確認してください。"
            : "LINE送信結果を保存できませんでした。再送せず、通知状態とLINEの送信履歴を確認してください。",
        },
        { status: 500 }
      );
    }
    if (!accepted) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          status: "failed",
          retryable: lineResponse.status >= 500,
          error: lineResponse.status >= 500
            ? "LINE送信に失敗しました。確定済み予約から再試行できます。"
            : "LINE送信に失敗しました。顧客のLINE連携状態を確認してください。",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      retried: claim.attempt_count > 1,
      message: acceptedRetry
        ? "LINEの重複送信を防ぎ、送信済みとして記録しました。"
        : "予約確定LINEを送信しました。",
    });
  } catch (error) {
    console.error("send-reservation-confirmed-line error:", error);
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error:
          "予約確定LINE通知処理に失敗しました。通知状態を確認してから再試行してください。",
      },
      { status: 500 }
    );
  }
}
