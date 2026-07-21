import { NextRequest, NextResponse } from "next/server";
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

async function sendReservationNoticeMail({
  customerName,
  menu,
  startIso,
  endIso,
  staffName,
  memo,
  durationMinutes,
}: {
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
    return;
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
  }
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
    return;
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
    return;
  }

  console.log("予約LINE通知成功");
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
    const durationMinutes = normalizeCustomerBookingDuration(
      body.durationMinutes
    );

    if (!menu) {
      return NextResponse.json(
        { ok: false, error: "メニューが未入力です" },
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

    const { data, error } = await supabase
      .from("reservations")
      .insert({
      menu,
      start_at: startIso,
      end_at: endIso,
      status: "requested",
      memo,
        staff_id: assignedStaffId,
        customer_id: customer.id,
        salon_id: salonId,
      })
      .select("id")
      .single();

    if (error) {
      console.error("customer reservation insert failed", error.code);
      return NextResponse.json(
        { ok: false, error: "予約保存に失敗しました" },
        { status: 500 }
      );
    }

    try {
      await sendReservationNoticeMail({
        customerName,
        menu,
        startIso,
        endIso,
        staffName,
        memo,
        durationMinutes,
      });
    } catch (mailError) {
      console.error("予約通知メール処理エラー:", mailError);
    }

    try {
      await sendReservationNoticeLine({
        reservationId: String(data.id),
        customerName,
        menu,
        startIso,
        endIso,
        staffName,
        memo,
        durationMinutes,
      });
    } catch (lineError) {
      console.error("予約LINE通知処理エラー:", lineError);
    }

    return NextResponse.json({
      ok: true,
      reservationId: data.id,
      assignedStaffId,
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
