import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";
import { isCancelledReservationStatus } from "@/lib/reservation-status";

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
  expectedCustomerId: string | null;
  expectedStaffId: string | null;
  expectedMenu: string | null;
  expectedStartAt: string | null;
  expectedEndAt: string | null;
  expectedStatus: string | null;
  expectedMemo: string | null;
};

type ReservationRow = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  source: string | null;
  memo: string | null;
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

function isExternalReservation(reservation: ReservationRow) {
  const source = (reservation.source || "").normalize("NFKC").toLowerCase();
  const memo = (reservation.memo || "").normalize("NFKC").toLowerCase();

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

  const expectedFieldKeys = [
    "expectedCustomerId",
    "expectedStaffId",
    "expectedMenu",
    "expectedStartAt",
    "expectedEndAt",
    "expectedStatus",
    "expectedMemo",
  ] as const;

  if (expectedFieldKeys.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return true;
    return body[key] !== null && typeof body[key] !== "string";
  })) {
    return {
      ok: false,
      error: "予約内容を読み直してからキャンセルしてください。",
    };
  }

  const expectedFields = {
    expectedCustomerId: body.expectedCustomerId as string | null,
    expectedStaffId: body.expectedStaffId as string | null,
    expectedMenu: body.expectedMenu as string | null,
    expectedStartAt: body.expectedStartAt as string | null,
    expectedEndAt: body.expectedEndAt as string | null,
    expectedStatus: body.expectedStatus as string | null,
    expectedMemo: body.expectedMemo as string | null,
  };

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
      ...expectedFields,
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
    const {
      sendLine,
      reason,
      reasonText = "",
      expectedCustomerId,
      expectedStaffId,
      expectedMenu,
      expectedStartAt,
      expectedEndAt,
      expectedStatus,
      expectedMemo,
    } = parsedBody.body;

    if (!reservationId) {
      return NextResponse.json(
        { ok: false, error: "キャンセル内容が正しくありません。" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: reservationData, error: reservationError } = await supabaseAdmin
      .from("reservations")
      .select(
        "id, salon_id, customer_id, staff_id, menu, start_at, end_at, status, source, memo"
      )
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

    if (isExternalReservation(reservation)) {
      return NextResponse.json(
        {
          ok: false,
          cancelled: false,
          error:
            "HPB・ミニモから同期された予約です。予約元でキャンセルしてください。",
        },
        { status: 409 }
      );
    }

    if (isCancelledReservationStatus(reservation.status)) {
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

    if (
      reservation.customer_id !== expectedCustomerId ||
      reservation.staff_id !== expectedStaffId ||
      reservation.menu !== expectedMenu ||
      !sameStoredDateTime(reservation.start_at, expectedStartAt) ||
      !sameStoredDateTime(reservation.end_at, expectedEndAt) ||
      reservation.status !== expectedStatus ||
      reservation.memo !== expectedMemo
    ) {
      return NextResponse.json(
        {
          ok: false,
          cancelled: false,
          status: "reservation_changed",
          error:
            "予約内容が更新されています。最新の内容を読み込み直してください。",
        },
        { status: 409 }
      );
    }

    let updateQuery = supabaseAdmin
      .from("reservations")
      .update({ status: "キャンセル" })
      .eq("id", reservation.id)
      .eq("salon_id", reservation.salon_id);

    for (const [column, value] of [
      ["customer_id", reservation.customer_id],
      ["staff_id", reservation.staff_id],
      ["menu", reservation.menu],
      ["start_at", reservation.start_at],
      ["end_at", reservation.end_at],
      ["status", reservation.status],
      ["memo", reservation.memo],
    ] as const) {
      updateQuery = value === null
        ? updateQuery.is(column, null)
        : updateQuery.eq(column, value);
    }

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
      const { data: latestReservation, error: latestReservationError } =
        await supabaseAdmin
          .from("reservations")
          .select("id, status")
          .eq("id", reservation.id)
          .eq("salon_id", reservation.salon_id)
          .maybeSingle();

      if (latestReservationError) {
        return NextResponse.json(
          {
            ok: false,
            cancelled: false,
            error: "最新の予約状態を確認できませんでした。画面を再読み込みしてください。",
          },
          { status: 500 }
        );
      }

      if (!latestReservation) {
        return NextResponse.json(
          { ok: false, cancelled: false, error: "予約が見つかりません。" },
          { status: 404 }
        );
      }

      if (!isCancelledReservationStatus(latestReservation.status)) {
        return NextResponse.json(
          {
            ok: false,
            cancelled: false,
            status: "reservation_changed",
            error:
              "別の操作で予約状態が更新されています。画面を再読み込みしてください。",
          },
          { status: 409 }
        );
      }

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
          status: "unknown",
          message:
            "予約はキャンセルしましたが、LINE通知の送信結果を確認できません。重複送信を避けるため再送せず、LINEの送信履歴を確認してください。",
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
