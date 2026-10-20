import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type ReservationRow = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  status: string | null;
  start_at: string | null;
  source: string | null;
  memo: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  salon_id: string | null;
  line_user_id: string | null;
};

type SalonRow = {
  id: string;
  name: string | null;
};

type ClaimRow = {
  claim_status: "claimed" | "already_sent" | "in_progress" | "retry_expired";
  attempt_count: number;
  line_retry_key: string;
  line_message: string;
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

function isRequestedStatus(status: string | null) {
  return (
    status === "requested" ||
    status === "予約申請中" ||
    status === "予約受付" ||
    status === "予約"
  );
}

function isExternalReservation(reservation: ReservationRow) {
  const source = (reservation.source || "").toLowerCase();
  const memo = (reservation.memo || "").toLowerCase();

  return (
    source.includes("hpb") ||
    source.includes("hotpepper") ||
    source.includes("hot pepper") ||
    source.includes("minimo") ||
    source.includes("ミニモ") ||
    memo.includes("hpb予約番号") ||
    memo.includes("ホットペッパー") ||
    memo.includes("ミニモ予約id") ||
    memo.includes("ミニモ")
  );
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
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getCustomerAppBaseUrl() {
  const candidate =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (!candidate) {
    throw new Error("顧客アプリURLが設定されていません");
  }

  const withProtocol = /^https?:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  const parsed = new URL(withProtocol);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("顧客アプリURLが正しくありません");
  }

  return parsed.origin;
}

function buildAlternativeRequestMessage(params: {
  customerName: string;
  salonName: string;
  startAt: string | null;
  reservationUrl: string;
}) {
  return `${params.customerName}様

${params.salonName}です。
ご希望いただいた${formatReservationDate(params.startAt)}からのご予約は、現在の空き状況では確定できませんでした。

お手数ですが、以下のページから別のご希望日時をご入力ください。
${params.reservationUrl}

LINEログイン後、この予約の日時を変更できます。`;
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
  ) {
    return null;
  }

  if (
    candidate.claim_status !== "claimed" &&
    candidate.claim_status !== "already_sent" &&
    candidate.claim_status !== "in_progress" &&
    candidate.claim_status !== "retry_expired"
  ) {
    return null;
  }

  return candidate as ClaimRow;
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  try {
    const { id: reservationId } = await context.params;

    if (!reservationId) {
      return NextResponse.json(
        { ok: false, sent: false, error: "予約IDがありません。" },
        { status: 400 }
      );
    }

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
      .select("id, salon_id, customer_id, status, start_at, source, memo")
      .eq("id", reservationId)
      .maybeSingle();

    if (reservationError) {
      throw new Error(reservationError.message);
    }

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

    if (!isRequestedStatus(reservation.status)) {
      return NextResponse.json(
        { ok: false, sent: false, error: "予約申請中の予約ではありません。" },
        { status: 409 }
      );
    }

    if (isExternalReservation(reservation)) {
      return NextResponse.json(
        { ok: false, sent: false, error: "外部予約にはこの通知を送信できません。" },
        { status: 409 }
      );
    }

    if (!reservation.customer_id) {
      return NextResponse.json(
        { ok: false, sent: false, error: "予約に顧客が紐付いていません。" },
        { status: 409 }
      );
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
      throw new Error(
        customerResult.error?.message ||
          salonResult.error?.message ||
          "顧客情報の確認に失敗しました"
      );
    }

    if (!customerResult.data) {
      return NextResponse.json(
        { ok: false, sent: false, error: "予約の顧客情報を確認できません。" },
        { status: 409 }
      );
    }

    const customer = customerResult.data as CustomerRow;
    const salon = (salonResult.data || null) as SalonRow | null;

    if (!customer.line_user_id) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          status: "not_linked",
          error: "顧客がLINE連携していないため送信できません。",
        },
        { status: 409 }
      );
    }

    const reservationUrl = `${getCustomerAppBaseUrl()}/customer-app/reservations/${encodeURIComponent(
      reservation.id
    )}`;
    const message = buildAlternativeRequestMessage({
      customerName: customer.name?.trim() || "お客様",
      salonName: salon?.name?.trim() || "Aily Nail Studio",
      startAt: reservation.start_at,
      reservationUrl,
    });

    const { data: claimData, error: claimError } = await supabaseAdmin.rpc(
      "claim_reservation_alternative_request",
      {
        p_reservation_id: reservation.id,
        p_customer_id: customer.id,
        p_salon_id: reservation.salon_id,
        p_requested_by_staff_id: authentication.principal.staffId,
        p_message: message,
      }
    );

    if (claimError) {
      throw new Error(claimError.message);
    }

    const claim = getClaimRow(claimData);

    if (!claim) {
      throw new Error("通知送信状態を確認できません");
    }

    if (claim.claim_status === "already_sent") {
      return NextResponse.json({
        ok: true,
        sent: false,
        alreadySent: true,
        message: "別日時入力のLINEは送信済みです。再送していません。",
      });
    }

    if (claim.claim_status === "in_progress") {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          status: "in_progress",
          error: "別の送信処理が進行中です。しばらくしてから確認してください。",
        },
        { status: 409 }
      );
    }

    if (claim.claim_status === "retry_expired") {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          status: "retry_expired",
          error:
            "安全に再送できる時間を過ぎています。LINEの送信履歴を確認してください。",
        },
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
      const errorMessage =
        error instanceof Error ? error.message : "LINE APIへの接続に失敗しました";
      let failureRecorded = false;
      try {
        const { data, error: completionError } = await supabaseAdmin.rpc(
          "complete_reservation_alternative_request",
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
        {
          ok: false,
          sent: false,
          status: "failed",
          retryable: true,
          error: "LINE送信に失敗しました。時間を置いて再試行できます。",
        },
        { status: 502 }
      );
    }

    const acceptedRetry =
      lineResponse.status === 409 &&
      Boolean(lineResponse.headers.get("x-line-accepted-request-id")?.trim());
    const accepted = lineResponse.ok || acceptedRetry;
    const lineErrorText = accepted
      ? ""
      : (
          await lineResponse
            .text()
            .catch(() => `LINE API HTTP ${lineResponse.status}: response body unavailable`)
        ).slice(0, 1000);
    let completionRecorded = false;
    try {
      const { data: completed, error: completionError } =
        await supabaseAdmin.rpc("complete_reservation_alternative_request", {
          p_reservation_id: reservation.id,
          p_attempt_count: claim.attempt_count,
          p_status: accepted ? "sent" : "failed",
          p_error: lineErrorText || null,
        });
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
          error:
            lineResponse.status >= 500
              ? "LINE送信に失敗しました。時間を置いて再試行できます。"
              : "LINE送信に失敗しました。顧客のLINE連携状態を確認してください。",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      retried: claim.attempt_count > 1,
      message:
        acceptedRetry
          ? "LINEの重複送信を防ぎ、送信済みとして記録しました。"
          : "別日時入力のLINEを送信しました。",
    });
  } catch (error) {
    console.error("request-alternative error:", error);
    const message =
      error instanceof Error ? error.message : "別日時入力のLINE送信に失敗しました。";

    return NextResponse.json(
      { ok: false, sent: false, error: message },
      { status: 500 }
    );
  }
}
