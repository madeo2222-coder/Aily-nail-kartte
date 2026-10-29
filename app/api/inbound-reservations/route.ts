import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isCancelledReservationStatus } from "@/lib/reservation-status";

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

type ExistingReservationRow = ReservationRow & {
  salon_id: string | null;
  menu: string | null;
};

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

function buildSubmissionDigest(params: {
  salonId: string;
  customerEmail: string;
  menu: string;
  guestCount: number;
  startIso: string;
  endIso: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      salonId: params.salonId,
      customerEmail: params.customerEmail.trim().toLowerCase(),
      menu: params.menu,
      guestCount: params.guestCount,
      startIso: params.startIso,
      endIso: params.endIso,
    }))
    .digest("hex");
}

function buildStableUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex");
  const variant = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function matchesExistingSubmission(params: {
  rows: ExistingReservationRow[];
  reservationIds: string[];
  salonId: string;
  menu: string;
  startIso: string;
  endIso: string;
}) {
  if (params.rows.length !== params.reservationIds.length) return false;
  const rowsById = new Map(params.rows.map((row) => [row.id, row]));
  return params.reservationIds.every((id, index) => {
    const row = rowsById.get(id);
    return Boolean(
      row &&
      row.salon_id === params.salonId &&
      row.menu === `${params.menu} / Guest ${index + 1}` &&
      row.start_at === params.startIso &&
      row.end_at === params.endIso
    );
  });
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
  idempotencyKey: string;
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
      "Idempotency-Key": params.idempotencyKey,
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
  submissionDigest: string;
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
    idempotencyKey: `inbound-reservation/${params.submissionDigest}/admin-email`,
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
  submissionDigest: string;
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
    idempotencyKey: `inbound-reservation/${params.submissionDigest}/customer-email`,
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
  submissionDigest: string;
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
      "X-Line-Retry-Key": buildStableUuid(
        `inbound-reservation/${params.submissionDigest}/admin-line`
      ),
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
    const submissionDigest = buildSubmissionDigest({
      salonId,
      customerEmail,
      menu,
      guestCount,
      startIso,
      endIso,
    });
    const reservationIds = Array.from(
      { length: guestCount },
      (_, index) => buildStableUuid(`inbound-reservation/${submissionDigest}/guest/${index + 1}`)
    );

    const readExistingSubmission = async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, salon_id, status, staff_id, start_at, end_at, menu")
        .in("id", reservationIds);
      if (error) return { state: "error" as const, error };

      const rows = (data || []) as ExistingReservationRow[];
      if (rows.length === 0) return { state: "missing" as const };
      if (!matchesExistingSubmission({
        rows,
        reservationIds,
        salonId,
        menu,
        startIso,
        endIso,
      })) {
        return { state: "conflict" as const };
      }
      return { state: "match" as const };
    };

    const existingSubmission = await readExistingSubmission();
    if (existingSubmission.state === "error") {
      return NextResponse.json(
        { ok: false, error: existingSubmission.error.message },
        { status: 500 }
      );
    }
    if (existingSubmission.state === "conflict") {
      return NextResponse.json(
        { ok: false, error: "Reservation request key conflict." },
        { status: 409 }
      );
    }
    if (existingSubmission.state === "match") {
      return NextResponse.json({
        ok: true,
        replayed: true,
        reservationIds,
      });
    }

    const { data: staffData, error: staffError } = await supabase
      .from("staffs")
      .select("id, name, salon_id")
      .eq("salon_id", salonId)
      .eq("role", "staff")
      .eq("is_active", true)
      .eq("customer_booking_enabled", true);

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
      (reservation) => !isCancelledReservationStatus(reservation.status)
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
      id: reservationIds[index],
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
      const reconciliation = await readExistingSubmission();
      if (reconciliation.state === "match") {
        return NextResponse.json({
          ok: true,
          replayed: true,
          reservationIds,
        });
      }
      if (reconciliation.state === "conflict") {
        return NextResponse.json(
          { ok: false, error: "Reservation request key conflict." },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    await Promise.allSettled([
      sendAdminMail({ customerName, customerEmail, menu, guestCount, startIso, endIso, memo, durationMinutes, submissionDigest }),
      sendCustomerConfirmationMail({ customerName, customerEmail, menu, guestCount, startIso, endIso, durationMinutes, submissionDigest }),
      sendInboundReservationLine({ customerName, customerEmail, menu, guestCount, startIso, endIso, memo, durationMinutes, submissionDigest }),
    ]);

    return NextResponse.json({
      ok: true,
      replayed: false,
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
