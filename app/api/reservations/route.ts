import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import {
  getCustomerReservationAvailability,
  isValidCustomerBookingDate,
  normalizeCustomerBookingDuration,
  resolveCustomerBookingSalonId,
} from "@/lib/server/customerReservationAvailability";
import {
  getSupabaseAdmin,
  requireCustomerLineSession,
} from "@/lib/server/requireCustomerLineSession";
import { isCustomerReservationOperationId } from "@/lib/customer-reservation-submission";

type ReservationWriteRow = {
  outcome: string;
  reservation_id: string | null;
};

function isMissingIdempotentCreateRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Record<string, unknown>;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

  return (
    code === "PGRST202" ||
    (message.includes("create_customer_requested_reservation_idempotent") &&
      (message.includes("could not find") || message.includes("does not exist")))
  );
}

function getReservationWriteRow(value: unknown): ReservationWriteRow | null {
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

  return candidate as ReservationWriteRow;
}

function formatDateTimeForMail(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createReservationNoticeLineRetryKey(reservationId: string) {
  const hex = createHash("sha256")
    .update(`customer-reservation-request\u001f${reservationId}`)
    .digest("hex");
  const variant = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

async function sendReservationNoticeMail({
  reservationId,
  customerName,
  menu,
  startIso,
  endIso,
  staffName,
  memo,
  durationMinutes,
}: {
  reservationId: string;
  customerName: string;
  menu: string;
  startIso: string;
  endIso: string;
  staffName: string;
  memo: string;
  durationMinutes: number;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.RESERVATION_NOTIFY_EMAIL;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Aily Nail Studio <onboarding@resend.dev>";

  if (!resendApiKey || !notifyEmail) {
    console.log(
      "予約通知メールはスキップされました: RESEND_API_KEY または RESERVATION_NOTIFY_EMAIL が未設定です"
    );
    return true;
  }

  const subject = "【Aily Nail Studio】新しい予約希望が入りました";

  const text = [
    "新しい予約希望が入りました。",
    "",
    `お客様名：${customerName}`,
    `メニュー：${menu}`,
    `予約開始：${formatDateTimeForMail(startIso)}`,
    `予約終了：${formatDateTimeForMail(endIso)}`,
    `所要時間：${durationMinutes}分`,
    `担当者：${staffName}`,
    `ステータス：予約申請中`,
    "",
    "ご要望・備考：",
    memo || "-",
    "",
    "スタッフ予約ページで内容を確認してください。",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.8; color: #111827;">
      <h2>新しい予約希望が入りました</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
        <tr><th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">お客様名</th><td style="padding:8px; border-bottom:1px solid #e5e7eb;">${customerName}</td></tr>
        <tr><th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">メニュー</th><td style="padding:8px; border-bottom:1px solid #e5e7eb;">${menu}</td></tr>
        <tr><th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">予約開始</th><td style="padding:8px; border-bottom:1px solid #e5e7eb;">${formatDateTimeForMail(
          startIso
        )}</td></tr>
        <tr><th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">予約終了</th><td style="padding:8px; border-bottom:1px solid #e5e7eb;">${formatDateTimeForMail(
          endIso
        )}</td></tr>
        <tr><th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">所要時間</th><td style="padding:8px; border-bottom:1px solid #e5e7eb;">${durationMinutes}分</td></tr>
        <tr><th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">担当者</th><td style="padding:8px; border-bottom:1px solid #e5e7eb;">${staffName}</td></tr>
        <tr><th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">ステータス</th><td style="padding:8px; border-bottom:1px solid #e5e7eb;">予約申請中</td></tr>
      </table>
      <h3 style="margin-top:24px;">ご要望・備考</h3>
      <div style="white-space:pre-wrap; background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:12px;">${memo || "-"}</div>
      <p style="margin-top:24px;">スタッフ予約ページで内容を確認してください。</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `customer-reservation-request-${reservationId}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [notifyEmail],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("予約通知メール送信エラー:", errorText);
    return false;
  }

  return true;
}

async function sendReservationNoticeLine({
  reservationId,
  customerName,
  menu,
  startIso,
  endIso,
  staffName,
  memo,
  durationMinutes,
}: {
  reservationId: string;
  customerName: string;
  menu: string;
  startIso: string;
  endIso: string;
  staffName: string;
  memo: string;
  durationMinutes: number;
}) {
  console.log("予約LINE通知処理開始");

  const lineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const adminUserId = process.env.LINE_ADMIN_USER_ID;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";

  console.log("LINE_CHANNEL_ACCESS_TOKEN exists:", !!lineAccessToken);
  console.log("LINE_ADMIN_USER_ID exists:", !!adminUserId);
  console.log("NEXT_PUBLIC_BASE_URL exists:", !!baseUrl);

  if (!lineAccessToken || !adminUserId) {
    console.log(
      "予約LINE通知はスキップされました: LINE_CHANNEL_ACCESS_TOKEN または LINE_ADMIN_USER_ID が未設定です"
    );
    return true;
  }

  const calendarUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/reservations/calendar`
    : "";
  const reservationUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/reservations/edit/${reservationId}`
    : "";

  const text = [
    "💅 新しい予約希望が入りました",
    "",
    `お客様名：${customerName}`,
    `メニュー：${menu}`,
    `予約開始：${formatDateTimeForMail(startIso)}`,
    `予約終了：${formatDateTimeForMail(endIso)}`,
    `所要時間：${durationMinutes}分`,
    `担当者：${staffName}`,
    `ステータス：予約申請中`,
    "",
    "ご要望・備考：",
    memo || "-",
    "",
    reservationUrl ? `予約確認：${reservationUrl}` : "",
    calendarUrl ? `カレンダー：${calendarUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  console.log("LINE push送信前");

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineAccessToken}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": createReservationNoticeLineRetryKey(reservationId),
    },
    body: JSON.stringify({
      to: adminUserId,
      messages: [{ type: "text", text }],
    }),
  });

  console.log("LINE API status:", response.status);

  const responseText = await response.text();
  console.log("LINE API response:", responseText || "no response body");

  if (!response.ok) {
    console.error("予約LINE通知送信エラー:", responseText);
    return false;
  }

  console.log("予約LINE通知成功");
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomerLineSession(request);

    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "LINEログインが必要です" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    const menu = String(body.menu || "").trim();
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const memo = String(body.memo || "").trim();
    const requestedStaffId = String(body.staffId || "").trim();
    const requestedOperationId = String(body.operationId || "").trim();
    const operationId = requestedOperationId || randomUUID();
    const durationMinutes = normalizeCustomerBookingDuration(
      body.durationMinutes
    );

    if (!menu) {
      return NextResponse.json(
        { ok: false, error: "メニューが未入力です" },
        { status: 400 }
      );
    }

    if (
      requestedOperationId &&
      !isCustomerReservationOperationId(requestedOperationId)
    ) {
      return NextResponse.json(
        { ok: false, error: "予約申請操作を確認できません" },
        { status: 400 }
      );
    }

    if (!isValidCustomerBookingDate(date)) {
      return NextResponse.json(
        { ok: false, error: "希望日を確認してください" },
        { status: 400 }
      );
    }

    if (!time) {
      return NextResponse.json(
        { ok: false, error: "希望時間が未入力です" },
        { status: 400 }
      );
    }

    if (durationMinutes === null) {
      return NextResponse.json(
        { ok: false, error: "所要時間を確認してください" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const salonId = await resolveCustomerBookingSalonId(
      supabase,
      customer.salonId
    );

    if (!salonId) {
      return NextResponse.json(
        { ok: false, error: "予約店舗を確認できません" },
        { status: 400 }
      );
    }

    const availability = await getCustomerReservationAvailability({
      supabase,
      salonId,
      date,
      durationMinutes,
      // The idempotent RPC stores the browser operation ID as the reservation
      // ID. Excluding it lets an HTTP-response-loss retry reach the RPC instead
      // of treating its own saved reservation as a new collision.
      excludeReservationId: requestedOperationId || undefined,
    });
    const selectedSlot = availability.slots.find(
      (slot) => slot.time === time
    );
    const availableStaffIds = selectedSlot?.staffIds || [];
    const assignedStaffId = requestedStaffId
      ? availableStaffIds.includes(requestedStaffId)
        ? requestedStaffId
        : null
      : availableStaffIds[0] || null;

    if (!assignedStaffId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "選択した時間の空き状況が変わりました。別の時間を選択してください",
        },
        { status: 409 }
      );
    }

    const assignedStaff = availability.staffs.find(
      (staff) => staff.id === assignedStaffId
    );

    if (!assignedStaff) {
      return NextResponse.json(
        { ok: false, error: "担当者を確認できません" },
        { status: 409 }
      );
    }

    const startAt = new Date(`${date}T${time}:00+09:00`);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
    const startIso = startAt.toISOString();
    const endIso = endAt.toISOString();
    const customerName = customer.name || "お客様";
    const staffName = assignedStaff.name || "担当者名未設定";

    let { data: writeData, error } = await supabase.rpc(
      "create_customer_requested_reservation_idempotent",
      {
        p_operation_id: operationId,
        p_salon_id: salonId,
        p_customer_id: customer.id,
        p_staff_id: assignedStaffId,
        p_menu: menu,
        p_start_at: startIso,
        p_end_at: endIso,
        p_memo: memo,
      }
    );

    // The Aily DB is updated manually. Keep the current booking path working
    // until the new RPC is applied, then switch to idempotent writes without a
    // second application release.
    if (isMissingIdempotentCreateRpc(error)) {
      const fallback = await supabase.rpc(
        "create_customer_requested_reservation",
        {
          p_salon_id: salonId,
          p_customer_id: customer.id,
          p_staff_id: assignedStaffId,
          p_menu: menu,
          p_start_at: startIso,
          p_end_at: endIso,
          p_memo: memo,
        }
      );
      writeData = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("customer reservation RPC failed", error.code);
      return NextResponse.json(
        { ok: false, error: "予約保存に失敗しました" },
        { status: 500 }
      );
    }

    const writeResult = getReservationWriteRow(writeData);

    if (!writeResult) {
      return NextResponse.json(
        { ok: false, error: "予約保存結果を確認できませんでした" },
        { status: 500 }
      );
    }

    if (writeResult.outcome === "slot_unavailable") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "選択した時間の空き状況が変わりました。別の時間を選択してください",
        },
        { status: 409 }
      );
    }

    if (writeResult.outcome === "invalid_staff") {
      return NextResponse.json(
        { ok: false, error: "選択した担当者は現在予約できません" },
        { status: 409 }
      );
    }

    if (writeResult.outcome === "customer_unavailable") {
      return NextResponse.json(
        {
          ok: false,
          error: "同じ時間帯にお客様の予約があります。予約一覧を確認してください",
        },
        { status: 409 }
      );
    }

    if (writeResult.outcome === "idempotency_conflict") {
      return NextResponse.json(
        {
          ok: false,
          error: "予約申請の内容が変わっています。画面を再読み込みしてください",
        },
        { status: 409 }
      );
    }

    if (
      !["created", "already_created"].includes(writeResult.outcome) ||
      !writeResult.reservation_id
    ) {
      return NextResponse.json(
        { ok: false, error: "予約内容を確認できませんでした" },
        { status: 409 }
      );
    }

    const reservationId = writeResult.reservation_id;

    const noticePayload = {
      reservationId,
      customerName,
      menu,
      startIso,
      endIso,
      staffName,
      memo,
      durationMinutes,
    };
    const [mailResult, lineResult] = await Promise.allSettled([
      sendReservationNoticeMail(noticePayload),
      sendReservationNoticeLine(noticePayload),
    ]);

    if (mailResult.status === "rejected") {
      console.error("予約通知メール処理エラー:", mailResult.reason);
    }
    if (lineResult.status === "rejected") {
      console.error("予約LINE通知処理エラー:", lineResult.reason);
    }

    const notificationFailed = [mailResult, lineResult].some(
      (result) => result.status === "rejected" || result.value === false
    );

    if (notificationFailed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "予約は保存されましたが、店舗への通知に失敗しました。通知を再試行してください",
          reservationSaved: true,
          notificationRetryable: true,
          reservationId,
          assignedStaffId,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      reservationId,
      assignedStaffId,
      alreadyCreated: writeResult.outcome === "already_created" || undefined,
    });
  } catch (error) {
    console.error(
      "customer reservation creation failed",
      error instanceof Error ? error.name : "UnknownError"
    );

    return NextResponse.json(
      { ok: false, error: "予約保存に失敗しました" },
      { status: 500 }
    );
  }
}
