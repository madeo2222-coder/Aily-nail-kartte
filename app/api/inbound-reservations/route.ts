import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type StaffRow = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

type ReservationRow = {
  id: string;
  status: string | null;
  staff_id: string | null;
  start_at: string | null;
  end_at: string | null;
};

function isCancelledStatus(status: string | null) {
  return status === "キャンセル" || status === "cancelled";
}

function normalizeDurationMinutes(value: unknown) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return 90;
  if (minutes < 30) return 30;
  if (minutes > 360) return 360;
  return Math.round(minutes);
}

function normalizeGuestCount(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  if (count < 1) return 1;
  if (count > 2) return 2;
  return Math.round(count);
}

function formatDateTimeForMail(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function sendEmail(params: {
  to: string[];
  subject: string;
  text: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Aily Nail Studio <onboarding@resend.dev>";

  if (!resendApiKey) {
    console.log("メール送信スキップ: RESEND_API_KEY が未設定です");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("メール送信エラー:", errorText);
  }
}

async function sendAdminMail(params: {
  customerName: string;
  customerEmail: string;
  menu: string;
  guestCount: number;
  startIso: string;
  endIso: string;
  memo: string;
  durationMinutes: number;
}) {
  const notifyEmail = process.env.RESERVATION_NOTIFY_EMAIL;
  if (!notifyEmail) return;

  const text = [
    "New inbound reservation request.",
    "",
    `Customer name: ${params.customerName}`,
    `Customer email: ${params.customerEmail}`,
    `Guests: ${params.guestCount}`,
    `Menu: ${params.menu}`,
    `Start: ${formatDateTimeForMail(params.startIso)}`,
    `End: ${formatDateTimeForMail(params.endIso)}`,
    `Duration: ${params.durationMinutes} minutes`,
    "",
    "Memo:",
    params.memo || "-",
  ].join("\n");

  await sendEmail({
    to: [notifyEmail],
    subject: "【Aily Nail Studio】Inbound reservation request",
    text,
  });
}

async function sendCustomerConfirmationMail(params: {
  customerName: string;
  customerEmail: string;
  menu: string;
  guestCount: number;
  startIso: string;
  endIso: string;
  durationMinutes: number;
}) {
  const text = [
    `Dear ${params.customerName},`,
    "",
    "Thank you for your reservation request at Aily Nail Studio.",
    "We have received your request with the details below.",
    "",
    `Guests: ${params.guestCount}`,
    `Menu: ${params.menu}`,
    `Start: ${formatDateTimeForMail(params.startIso)}`,
    `End: ${formatDateTimeForMail(params.endIso)}`,
    `Estimated duration: ${params.durationMinutes} minutes`,
    "",
    "Important notes:",
    "Please arrive on time.",
    "Late arrival may shorten the service time.",
    "No-show or same-day cancellation may be charged a cancellation fee.",
    "",
    "This is a reservation request. Our staff will confirm your reservation after checking the schedule.",
    "",
    "Aily Nail Studio",
  ].join("\n");

  await sendEmail({
    to: [params.customerEmail],
    subject: "Aily Nail Studio - Reservation request received",
    text,
  });
}

async function sendInboundReservationLine(params: {
  customerName: string;
  customerEmail: string;
  menu: string;
  guestCount: number;
  startIso: string;
  endIso: string;
  memo: string;
  durationMinutes: number;
}) {
  const lineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const adminUserId = process.env.LINE_ADMIN_USER_ID;

  if (!lineAccessToken || !adminUserId) return;

  const text = [
    "🌏 Inbound reservation request",
    "",
    `Customer: ${params.customerName}`,
    `Email: ${params.customerEmail}`,
    `Guests: ${params.guestCount}`,
    `Menu: ${params.menu}`,
    `Start: ${formatDateTimeForMail(params.startIso)}`,
    `End: ${formatDateTimeForMail(params.endIso)}`,
    `Duration: ${params.durationMinutes} minutes`,
    "",
    "Memo:",
    params.memo || "-",
  ].join("\n");

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

  if (!response.ok) {
    const errorText = await response.text();
    console.error("インバウンド予約LINE通知送信エラー:", errorText);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const menu = String(body.menu || "").trim();
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const memo = String(body.memo || "").trim();
    const salonId = String(body.salonId || "").trim();
    const customerName = String(body.customerName || "").trim();
    const customerEmail = String(body.customerEmail || "").trim();
    const durationMinutes = normalizeDurationMinutes(body.durationMinutes);
    const guestCount = normalizeGuestCount(body.guestCount);

    if (!menu) return NextResponse.json({ ok: false, error: "Menu is required." }, { status: 400 });
    if (!date) return NextResponse.json({ ok: false, error: "Date is required." }, { status: 400 });
    if (!time) return NextResponse.json({ ok: false, error: "Time is required." }, { status: 400 });
    if (!salonId) return NextResponse.json({ ok: false, error: "Salon is required." }, { status: 400 });
    if (!customerName) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
    if (!customerEmail) return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });

    const startAt = new Date(`${date}T${time}:00+09:00`);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid reservation date." }, { status: 400 });
    }

    const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
    const startIso = startAt.toISOString();
    const endIso = endAt.toISOString();

    const { data: staffData, error: staffError } = await supabase
      .from("staffs")
      .select("id, name, salon_id")
      .eq("salon_id", salonId);

    if (staffError) {
      return NextResponse.json({ ok: false, error: staffError.message }, { status: 500 });
    }

    const staffs = (staffData || []) as StaffRow[];

    const { data: overlapData, error: overlapError } = await supabase
      .from("reservations")
      .select("id, status, staff_id, start_at, end_at")
      .eq("salon_id", salonId)
      .lt("start_at", endIso)
      .gt("end_at", startIso);

    if (overlapError) {
      return NextResponse.json({ ok: false, error: overlapError.message }, { status: 500 });
    }

    const overlaps = ((overlapData || []) as ReservationRow[]).filter(
      (reservation) => !isCancelledStatus(reservation.status)
    );

    const busyStaffIds = new Set(
      overlaps
        .map((reservation) => reservation.staff_id)
        .filter((id): id is string => typeof id === "string" && !!id)
    );

    const availableStaffs = staffs.filter((staff) => !busyStaffIds.has(staff.id));

    if (availableStaffs.length < guestCount) {
      return NextResponse.json(
        {
          ok: false,
          error: "Not enough staff available at this time. Please choose another time.",
        },
        { status: 400 }
      );
    }

    const assignedStaffs = availableStaffs.slice(0, guestCount);

    const insertRows = assignedStaffs.map((staff, index) => ({
      menu: `${menu} / Guest ${index + 1}`,
      start_at: startIso,
      end_at: endIso,
      status: "requested",
      memo: [
        memo,
        "",
        "Inbound group reservation",
        `Group size: ${guestCount}`,
        `Guest slot: ${index + 1}`,
        `Customer name: ${customerName}`,
        `Customer email: ${customerEmail}`,
        `Assigned staff: ${staff.name || "No name"}`,
      ]
        .filter(Boolean)
        .join("\n"),
      staff_id: staff.id,
      salon_id: salonId,
    }));

    const { data: insertedData, error: insertError } = await supabase
      .from("reservations")
      .insert(insertRows)
      .select("id");

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    await Promise.allSettled([
      sendAdminMail({ customerName, customerEmail, menu, guestCount, startIso, endIso, memo, durationMinutes }),
      sendCustomerConfirmationMail({ customerName, customerEmail, menu, guestCount, startIso, endIso, durationMinutes }),
      sendInboundReservationLine({ customerName, customerEmail, menu, guestCount, startIso, endIso, memo, durationMinutes }),
    ]);

    return NextResponse.json({
      ok: true,
      reservationIds: (insertedData || []).map((row) => row.id),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Inbound reservation failed.",
      },
      { status: 500 }
    );
  }
}