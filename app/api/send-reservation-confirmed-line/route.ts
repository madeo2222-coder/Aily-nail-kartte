import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type SendReservationConfirmedLineBody = {
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

function buildLineMessage(params: {
  customerName: string;
  salonName: string;
  menuName: string;
  staffName: string;
  startAt: string;
  endAt: string;
}) {
  return `${params.customerName}様

ご予約が確定しました💅

【予約内容】
サロン：${params.salonName}
日時：${params.startAt} 〜 ${params.endAt}
メニュー：${params.menuName}
担当：${params.staffName}

ご来店を心よりお待ちしております。`;
}

export async function POST(request: Request) {
  try {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!channelAccessToken) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message: "LINE_CHANNEL_ACCESS_TOKEN が未設定です",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as SendReservationConfirmedLineBody;
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

    const lineUserId = getString(customer, ["line_user_id"]);

    if (!lineUserId) {
      return NextResponse.json({
        ok: true,
        sent: false,
        message:
          "顧客の line_user_id が未登録のため、LINE通知はスキップしました",
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

    const messageText = buildLineMessage({
      customerName,
      salonName,
      menuName,
      staffName,
      startAt,
      endAt,
    });

    const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: "text",
            text: messageText,
          },
        ],
      }),
    });

    if (!lineResponse.ok) {
      const errorText = await lineResponse.text();
      console.error("LINE予約確定通知エラー:", errorText);

      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message: "LINE通知の送信に失敗しました",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      message: "予約確定LINE通知を送信しました",
    });
  } catch (error) {
    console.error("send-reservation-confirmed-line error:", error);

    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message: "予約確定LINE通知処理でエラーが発生しました",
      },
      { status: 500 }
    );
  }
}