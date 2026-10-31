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
  status: string | null;
  start_at: string | null;
  end_at: string | null;
  source: string | null;
  memo: string | null;
};

type AlternativeRequestBody = {
  expectedCustomerId: string | null;
  expectedStaffId: string | null;
  expectedMenu: string | null;
  expectedStartAt: string | null;
  expectedEndAt: string | null;
  expectedStatus: string | null;
  expectedMemo: string | null;
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

type ClaimFailure = {
  status: 403 | 409;
  error: string;
};

const LINE_REQUEST_TIMEOUT_MS = 10_000;
const LINE_TEXT_MAX_CODE_UNITS = 5_000;

function parseAlternativeRequestBody(
  value: unknown
): AlternativeRequestBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const body = value as Record<string, unknown>;
  const keys = [
    "expectedCustomerId",
    "expectedStaffId",
    "expectedMenu",
    "expectedStartAt",
    "expectedEndAt",
    "expectedStatus",
    "expectedMemo",
  ] as const;

  if (
    keys.some(
      (key) =>
        !Object.prototype.hasOwnProperty.call(body, key) ||
        (body[key] !== null && typeof body[key] !== "string")
    )
  ) {
    return null;
  }

  return Object.fromEntries(
    keys.map((key) => [key, body[key]])
  ) as AlternativeRequestBody;
}

function sameStoredDateTime(current: string | null, expected: string | null) {
  if (current === expected) return true;
  if (!current || !expected) return false;

  const currentTime = new Date(current).getTime();
  const expectedTime = new Date(expected).getTime();

  return (
    Number.isFinite(currentTime) &&
    Number.isFinite(expectedTime) &&
    currentTime === expectedTime
  );
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

function isRequestedStatus(status: string | null) {
  const normalized = String(status ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

  return (
    normalized === "requested" ||
    normalized === "予約申請中" ||
    normalized === "予約受付" ||
    normalized === "予約"
  );
}

function isExternalReservation(reservation: ReservationRow) {
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

function getClaimFailure(message: string): ClaimFailure | null {
  if (
    message.includes("ALTERNATIVE_REQUEST_INVALID_STAFF") ||
    message.includes("ALTERNATIVE_REQUEST_SCOPE_MISMATCH")
  ) {
    return {
      status: 403,
      error: "この予約を操作する権限がありません。",
    };
  }

  if (message.includes("ALTERNATIVE_REQUEST_INVALID_RESERVATION")) {
    return {
      status: 409,
      error: "予約状態が更新されています。最新の内容を読み込み直してください。",
    };
  }

  return null;
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

  let requestBody: AlternativeRequestBody | null = null;
  try {
    requestBody = parseAlternativeRequestBody(await request.json());
  } catch {
    // The request must include the exact reservation snapshot shown to staff.
  }

  if (!requestBody) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error: "予約内容を読み直してから別日時を依頼してください。",
      },
      { status: 400 }
    );
  }

  try {
    const { id: reservationId } = await context.params;
    const salonId = authentication.principal.salonId;

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
      .select(
        "id, salon_id, customer_id, staff_id, menu, status, start_at, end_at, source, memo"
      )
      .eq("id", reservationId)
      .eq("salon_id", salonId)
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

    if (reservation.salon_id !== salonId) {
      return NextResponse.json(
        { ok: false, sent: false, error: "この予約を操作する権限がありません。" },
        { status: 403 }
      );
    }

    if (
      reservation.customer_id !== requestBody.expectedCustomerId ||
      reservation.staff_id !== requestBody.expectedStaffId ||
      reservation.menu !== requestBody.expectedMenu ||
      !sameStoredDateTime(
        reservation.start_at,
        requestBody.expectedStartAt
      ) ||
      !sameStoredDateTime(reservation.end_at, requestBody.expectedEndAt) ||
      reservation.status !== requestBody.expectedStatus ||
      reservation.memo !== requestBody.expectedMemo
    ) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          error: "予約内容が更新されています。最新の内容を読み込み直してください。",
        },
        { status: 409 }
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

    // LINE counts text length in UTF-16 code units, which matches
    // JavaScript's String.length. Stop before claiming a delivery so a known
    // invalid payload does not create a retryable send attempt.
    if (message.length > LINE_TEXT_MAX_CODE_UNITS) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          status: "message_too_long",
          error:
            "別日時依頼LINEの内容が長すぎます。顧客名・サロン名を短くしてから再試行してください。",
        },
        { status: 400 }
      );
    }

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
      const claimFailure = getClaimFailure(claimError.message);

      if (claimFailure) {
        return NextResponse.json(
          { ok: false, sent: false, error: claimFailure.error },
          { status: claimFailure.status }
        );
      }

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
          retryAfterSeconds: 300,
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

    // A safe retry reuses the message stored with its LINE retry key. Validate
    // that claimed payload too, because it can predate the current request and
    // differ from the freshly generated message checked above.
    if (claim.line_message.length > LINE_TEXT_MAX_CODE_UNITS) {
      try {
        await supabaseAdmin.rpc("complete_reservation_alternative_request", {
          p_reservation_id: reservation.id,
          p_attempt_count: claim.attempt_count,
          p_status: "failed",
          p_error: "LINE message exceeds 5000 UTF-16 code units",
        });
      } catch {
        // No external request was made. The delivery remains blocked even if
        // its ledger cannot be moved out of the sending state.
      }

      return NextResponse.json(
        {
          ok: false,
          sent: false,
          status: "message_too_long",
          retryable: false,
          error:
            "保存済みの別日時依頼LINEが長すぎるため送信していません。通知状態を確認してください。",
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

    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error:
          "別日時入力のLINE通知処理に失敗しました。予約と通知状態を確認してから再試行してください。",
      },
      { status: 500 }
    );
  }
}
