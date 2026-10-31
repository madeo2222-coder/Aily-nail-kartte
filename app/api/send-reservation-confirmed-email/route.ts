import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type SendReservationConfirmedEmailBody = {
  reservationId?: string;
  expectedIdempotencyKey?: string;
  attemptId?: string;
};
type ReservationRow = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  staff_id: string | null;
  status: string | null;
  menu: string | null;
  start_at: string | null;
  end_at: string | null;
  updated_at: string | null;
  source: string | null;
  memo: string | null;
};
type CustomerRow = {
  id: string;
  salon_id: string | null;
  name?: string | null;
  customer_name?: string | null;
  email?: string | null;
  email_address?: string | null;
  mail?: string | null;
  customer_email?: string | null;
};
type NamedRow = {
  id: string;
  name?: string | null;
  salon_name?: string | null;
  staff_name?: string | null;
};
type AnyRow = Record<string, unknown>;
type MailParams = {
  customerName: string;
  salonName: string;
  menuName: string;
  staffName: string;
  startAt: string;
  endAt: string;
};
type MailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

const RESERVATION_SELECT =
  "id, salon_id, customer_id, staff_id, status, menu, start_at, end_at, updated_at, source, memo";

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

function getString(row: AnyRow | null, keys: string[]) {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
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

function isConfirmedStatus(status: string | null) {
  const normalized = String(status ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

  return normalized === "confirmed" || normalized === "予約確定";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPlainText(params: MailParams) {
  return `${params.customerName} 様

ご予約が確定しました。

【予約内容】
サロン：${params.salonName}
日時：${params.startAt} 〜 ${params.endAt}
メニュー：${params.menuName}
担当：${params.staffName}

ご来店を心よりお待ちしております。

${params.salonName}`;
}

function buildHtml(params: MailParams) {
  const customerName = escapeHtml(params.customerName);
  const salonName = escapeHtml(params.salonName);
  const menuName = escapeHtml(params.menuName);
  const staffName = escapeHtml(params.staffName);
  const startAt = escapeHtml(params.startAt);
  const endAt = escapeHtml(params.endAt);

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#fff7fb; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:24px; padding:24px; border:1px solid #ffe4ef;">
        <div style="font-size:12px; font-weight:700; color:#f43f5e; letter-spacing:0.18em;">AILY NAIL STUDIO</div>
        <h1 style="font-size:22px; color:#111827; margin:12px 0 8px;">ご予約が確定しました</h1>
        <p style="font-size:15px; line-height:1.8; color:#374151;">
          ${customerName} 様<br />
          ご予約ありがとうございます。下記内容でご予約が確定しました。
        </p>
        <div style="background:#fff1f5; border-radius:18px; padding:16px; margin:20px 0;">
          <div style="font-size:13px; color:#9f1239; font-weight:700; margin-bottom:10px;">予約内容</div>
          <table style="width:100%; border-collapse:collapse; font-size:14px; color:#374151;">
            <tr><td style="padding:8px 0; color:#6b7280; width:90px;">サロン</td><td style="padding:8px 0; font-weight:700;">${salonName}</td></tr>
            <tr><td style="padding:8px 0; color:#6b7280;">日時</td><td style="padding:8px 0; font-weight:700;">${startAt} 〜 ${endAt}</td></tr>
            <tr><td style="padding:8px 0; color:#6b7280;">メニュー</td><td style="padding:8px 0; font-weight:700;">${menuName}</td></tr>
            <tr><td style="padding:8px 0; color:#6b7280;">担当</td><td style="padding:8px 0; font-weight:700;">${staffName}</td></tr>
          </table>
        </div>
        <p style="font-size:14px; line-height:1.8; color:#374151;">ご来店を心よりお待ちしております。</p>
        <div style="margin-top:24px; font-size:12px; color:#9ca3af;">${salonName}</div>
      </div>
    </div>
  `;
}

function buildMailPayload({
  reservation,
  customer,
  staff,
  salon,
  fromEmail,
}: {
  reservation: ReservationRow;
  customer: CustomerRow;
  staff: NamedRow | null;
  salon: NamedRow;
  fromEmail: string;
}): MailPayload {
  const mailParams: MailParams = {
    customerName:
      getString(customer as AnyRow, ["name", "customer_name"]) || "お客様",
    salonName:
      getString(salon as AnyRow, ["name", "salon_name"]) ||
      "Aily Nail Studio",
    staffName:
      getString(staff as AnyRow | null, ["name", "staff_name"]) ||
      "指名なし",
    menuName: reservation.menu?.trim() || "メニュー未設定",
    startAt: formatDateTime(reservation.start_at),
    endAt: formatDateTime(reservation.end_at),
  };

  return {
    from: fromEmail,
    to: getString(customer as AnyRow, [
      "email",
      "email_address",
      "mail",
      "customer_email",
    ]),
    subject: `【${mailParams.salonName}】ご予約が確定しました`,
    text: buildPlainText(mailParams),
    html: buildHtml(mailParams),
  };
}

function reservationSnapshot(reservation: ReservationRow) {
  return JSON.stringify([
    reservation.id,
    reservation.salon_id,
    reservation.customer_id,
    reservation.staff_id,
    reservation.status,
    reservation.menu,
    reservation.start_at,
    reservation.end_at,
    reservation.updated_at,
    reservation.source,
    reservation.memo,
  ]);
}

function buildIdempotencyKey(
  reservationId: string,
  payload: object,
  attemptId?: string
) {
  const digest = createHash("sha256")
    .update(attemptId || JSON.stringify(payload))
    .digest("hex")
    .slice(0, 32);
  return `reservation-confirmed-email/${reservationId}/${digest}`;
}

function getResendErrorName(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>).name;
  return typeof value === "string" ? value : "";
}

function isRetryableResendError(error: unknown) {
  return [
    "concurrent_idempotent_requests",
    "rate_limit_exceeded",
    "application_error",
    "internal_server_error",
  ].includes(getResendErrorName(error));
}

export async function POST(request: Request) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: true,
  });
  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, sent: false, message: authentication.error },
      { status: authentication.status }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, sent: false, message: "予約内容を読み取れませんでした。" },
      { status: 400 }
    );
  }
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json(
      { ok: false, sent: false, message: "予約内容が正しくありません。" },
      { status: 400 }
    );
  }
  const body = rawBody as SendReservationConfirmedEmailBody;
  if (typeof body.reservationId !== "string" || !body.reservationId.trim()) {
    return NextResponse.json(
      { ok: false, sent: false, message: "予約IDがありません。" },
      { status: 400 }
    );
  }
  const reservationId = body.reservationId.trim();
  if (
    body.attemptId !== undefined &&
    (typeof body.attemptId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.attemptId.trim()
      ))
  ) {
    return NextResponse.json(
      { ok: false, sent: false, message: "メール送信要求が正しくありません。" },
      { status: 400 }
    );
  }
  const attemptId = body.attemptId?.trim().toLowerCase();
  const expectedIdempotencyKey = body.expectedIdempotencyKey;
  if (
    expectedIdempotencyKey !== undefined &&
    (typeof expectedIdempotencyKey !== "string" ||
      !/^reservation-confirmed-email\/[^/\s]+\/[a-f0-9]{32}$/.test(
        expectedIdempotencyKey
      ))
  ) {
    return NextResponse.json(
      { ok: false, sent: false, message: "メール再試行情報が正しくありません。" },
      { status: 400 }
    );
  }

  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, sent: false, message: "メール送信設定がありません。" },
        { status: 500 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const readReservation = () =>
      supabaseAdmin
        .from("reservations")
        .select(RESERVATION_SELECT)
        .eq("id", reservationId)
        .eq("salon_id", authentication.principal.salonId)
        .maybeSingle();

    const { data: reservationData, error: reservationError } =
      await readReservation();
    if (reservationError) throw new Error(reservationError.message);
    if (!reservationData) {
      return NextResponse.json(
        { ok: false, sent: false, message: "予約情報が見つかりません。" },
        { status: 404 }
      );
    }

    const reservation = reservationData as ReservationRow;
    if (!isConfirmedStatus(reservation.status)) {
      return NextResponse.json(
        { ok: false, sent: false, message: "予約確定済みの予約ではありません。" },
        { status: 409 }
      );
    }
    if (isExternalReservation(reservation)) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message:
            "HPB・ミニモから登録された予約には、Nailyの予約確定メールを送信できません。",
        },
        { status: 409 }
      );
    }
    if (!reservation.customer_id || !reservation.salon_id) {
      return NextResponse.json(
        { ok: false, sent: false, message: "予約に顧客またはサロンが紐付いていません。" },
        { status: 409 }
      );
    }

    const readCustomer = () =>
      supabaseAdmin
        .from("customers")
        .select("*")
        .eq("id", reservation.customer_id)
        .eq("salon_id", reservation.salon_id)
        .maybeSingle();
    const readStaff = () =>
      reservation.staff_id
        ? supabaseAdmin
            .from("staffs")
            .select("id, name")
            .eq("id", reservation.staff_id)
            .eq("salon_id", reservation.salon_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });
    const readSalon = () =>
      supabaseAdmin
        .from("salons")
        .select("id, name")
        .eq("id", reservation.salon_id)
        .maybeSingle();

    const [customerResult, staffResult, salonResult] = await Promise.all([
      readCustomer(),
      readStaff(),
      readSalon(),
    ]);
    if (customerResult.error || staffResult.error || salonResult.error) {
      throw new Error(
        customerResult.error?.message ||
          staffResult.error?.message ||
          salonResult.error?.message ||
          "予約情報の確認に失敗しました"
      );
    }
    if (!customerResult.data || !salonResult.data) {
      return NextResponse.json(
        { ok: false, sent: false, message: "予約の顧客またはサロン情報を確認できません。" },
        { status: 409 }
      );
    }

    const customer = customerResult.data as CustomerRow;
    const staff = (staffResult.data || null) as NamedRow | null;
    const salon = salonResult.data as NamedRow;
    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      "Aily Nail Studio <onboarding@resend.dev>";
    const mailPayload = buildMailPayload({
      reservation,
      customer,
      staff,
      salon,
      fromEmail,
    });
    if (!mailPayload.to) {
      return NextResponse.json({
        ok: true,
        sent: false,
        message: "顧客メールアドレスが未登録のため、メール送信はスキップしました。",
      });
    }

    const [
      latestReservationResult,
      latestCustomerResult,
      latestStaffResult,
      latestSalonResult,
    ] = await Promise.all([
      readReservation(),
      readCustomer(),
      readStaff(),
      readSalon(),
    ]);
    if (
      latestReservationResult.error ||
      latestCustomerResult.error ||
      latestStaffResult.error ||
      latestSalonResult.error
    ) {
      throw new Error(
        latestReservationResult.error?.message ||
          latestCustomerResult.error?.message ||
          latestStaffResult.error?.message ||
          latestSalonResult.error?.message ||
          "予約情報の再確認に失敗しました"
      );
    }

    const latestReservation = latestReservationResult.data as ReservationRow | null;
    const latestCustomer = latestCustomerResult.data as CustomerRow | null;
    const latestStaff = (latestStaffResult.data || null) as NamedRow | null;
    const latestSalon = latestSalonResult.data as NamedRow | null;
    const latestMailPayload =
      latestReservation && latestCustomer && latestSalon
        ? buildMailPayload({
            reservation: latestReservation,
            customer: latestCustomer,
            staff: latestStaff,
            salon: latestSalon,
            fromEmail,
          })
        : null;
    if (
      !latestReservation ||
      reservationSnapshot(latestReservation) !== reservationSnapshot(reservation) ||
      !latestMailPayload ||
      JSON.stringify(latestMailPayload) !== JSON.stringify(mailPayload)
    ) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message: "予約内容が更新されています。最新の内容を読み込み直してください。",
        },
        { status: 409 }
      );
    }

    const payloadIdempotencyKey = buildIdempotencyKey(
      reservation.id,
      mailPayload
    );
    const providerIdempotencyKey = buildIdempotencyKey(
      reservation.id,
      mailPayload,
      attemptId
    );
    if (
      expectedIdempotencyKey !== undefined &&
      expectedIdempotencyKey !== payloadIdempotencyKey
    ) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          retryable: false,
          message:
            "予約内容または送信先が更新されています。再送せず、最新の内容を確認してください。",
        },
        { status: 409 }
      );
    }
    const resend = new Resend(apiKey);
    let sendResult: Awaited<ReturnType<typeof resend.emails.send>>;
    try {
      sendResult = await resend.emails.send(mailPayload, {
        idempotencyKey: providerIdempotencyKey,
      });
    } catch {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          retryable: true,
          retryWindowHours: 24,
          retryToken: payloadIdempotencyKey,
          message: "メール送信結果を確認できませんでした。同じ予約内容なら24時間以内に安全に再試行できます。",
        },
        { status: 502 }
      );
    }

    if (sendResult.error) {
      const retryable = isRetryableResendError(sendResult.error);
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          retryable,
          ...(retryable ? { retryWindowHours: 24 } : {}),
          ...(retryable ? { retryToken: payloadIdempotencyKey } : {}),
          message: retryable
            ? "予約確定メールの送信に失敗しました。同じ予約内容なら24時間以内に再試行できます。"
            : "予約確定メールを送信できませんでした。顧客メールアドレスと送信設定を確認してください。",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      idempotencyProtected: true,
      message: "予約確定メールを送信しました。",
    });
  } catch (error) {
    console.error("send-reservation-confirmed-email error:", error);
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message: "予約確定メール通知処理に失敗しました。最新の状態を確認してから再試行してください。",
      },
      { status: 500 }
    );
  }
}
