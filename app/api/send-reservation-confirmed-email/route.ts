import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type SendReservationConfirmedEmailBody = {
  reservationId?: string;
};

type AnyRow = Record<string, unknown>;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase環境変数が不足しています");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function getString(row: AnyRow | null, keys: string[]) {
  if (!row) return "";

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeSupabaseDateTime(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const isoLike = trimmed.includes("T")
    ? trimmed
    : trimmed.replace(" ", "T");

  return `${isoLike}Z`;
}

function formatDateTime(value: string | null) {
  const normalizedValue = normalizeSupabaseDateTime(value);

  if (!normalizedValue) return "未設定";

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return "未設定";
  }

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

function buildPlainText(params: {
  customerName: string;
  salonName: string;
  menuName: string;
  staffName: string;
  startAt: string;
  endAt: string;
}) {
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

function buildHtml(params: {
  customerName: string;
  salonName: string;
  menuName: string;
  staffName: string;
  startAt: string;
  endAt: string;
}) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#fff7fb; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:24px; padding:24px; border:1px solid #ffe4ef;">
        <div style="font-size:12px; font-weight:700; color:#f43f5e; letter-spacing:0.18em;">
          AILY NAIL STUDIO
        </div>

        <h1 style="font-size:22px; color:#111827; margin:12px 0 8px;">
          ご予約が確定しました
        </h1>

        <p style="font-size:15px; line-height:1.8; color:#374151;">
          ${params.customerName} 様<br />
          ご予約ありがとうございます。下記内容でご予約が確定しました。
        </p>

        <div style="background:#fff1f5; border-radius:18px; padding:16px; margin:20px 0;">
          <div style="font-size:13px; color:#9f1239; font-weight:700; margin-bottom:10px;">
            予約内容
          </div>

          <table style="width:100%; border-collapse:collapse; font-size:14px; color:#374151;">
            <tr>
              <td style="padding:8px 0; color:#6b7280; width:90px;">サロン</td>
              <td style="padding:8px 0; font-weight:700;">${params.salonName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">日時</td>
              <td style="padding:8px 0; font-weight:700;">${params.startAt} 〜 ${params.endAt}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">メニュー</td>
              <td style="padding:8px 0; font-weight:700;">${params.menuName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">担当</td>
              <td style="padding:8px 0; font-weight:700;">${params.staffName}</td>
            </tr>
          </table>
        </div>

        <p style="font-size:14px; line-height:1.8; color:#374151;">
          ご来店を心よりお待ちしております。
        </p>

        <div style="margin-top:24px; font-size:12px; color:#9ca3af;">
          ${params.salonName}
        </div>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message: "RESEND_API_KEY が未設定です",
        },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    const body = (await request.json()) as SendReservationConfirmedEmailBody;
    const reservationId = body.reservationId;

    if (!reservationId) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message: "reservationId がありません",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: reservation, error: reservationError } = await supabaseAdmin
      .from("reservations")
      .select("*")
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message: "予約情報が見つかりません",
        },
        { status: 404 }
      );
    }

    const reservationRow = reservation as AnyRow;

    const customerId = getString(reservationRow, ["customer_id"]);
    const staffId = getString(reservationRow, ["staff_id"]);
    const salonId = getString(reservationRow, ["salon_id"]);

    const [customerRes, staffRes, salonRes] = await Promise.all([
      customerId
        ? supabaseAdmin
            .from("customers")
            .select("*")
            .eq("id", customerId)
            .single()
        : Promise.resolve({ data: null, error: null }),
      staffId
        ? supabaseAdmin.from("staffs").select("*").eq("id", staffId).single()
        : Promise.resolve({ data: null, error: null }),
      salonId
        ? supabaseAdmin.from("salons").select("*").eq("id", salonId).single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const customer = (customerRes.data || null) as AnyRow | null;
    const staff = (staffRes.data || null) as AnyRow | null;
    const salon = (salonRes.data || null) as AnyRow | null;

    const toEmail = getString(customer, [
      "email",
      "email_address",
      "mail",
      "customer_email",
    ]);

    if (!toEmail) {
      return NextResponse.json({
        ok: true,
        sent: false,
        message:
          "顧客メールアドレスが未登録のため、メール送信はスキップしました",
      });
    }

    const customerName =
      getString(customer, ["name", "customer_name"]) || "お客様";

    const salonName =
      getString(salon, ["name", "salon_name"]) || "Aily Nail Studio";

    const staffName = getString(staff, ["name", "staff_name"]) || "指名なし";

    const menuName =
      getString(reservationRow, ["menu", "menu_name"]) || "メニュー未設定";

    const startAt = formatDateTime(getString(reservationRow, ["start_at"]));
    const endAt = formatDateTime(getString(reservationRow, ["end_at"]));

    const subject = `【${salonName}】ご予約が確定しました`;

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      "Aily Nail Studio <onboarding@resend.dev>";

    const mailParams = {
      customerName,
      salonName,
      menuName,
      staffName,
      startAt,
      endAt,
    };

    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      text: buildPlainText(mailParams),
      html: buildHtml(mailParams),
    });

    if (sendError) {
      console.error("予約確定メール送信エラー:", sendError);

      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message: "予約確定メールの送信に失敗しました",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      message: "予約確定メールを送信しました",
    });
  } catch (error) {
    console.error("send-reservation-confirmed-email error:", error);

    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message: "予約確定メール送信処理でエラーが発生しました",
      },
      { status: 500 }
    );
  }
}