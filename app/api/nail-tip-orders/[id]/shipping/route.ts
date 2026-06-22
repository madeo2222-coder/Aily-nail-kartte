import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type AnyRow = Record<string, unknown>;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase環境変数不足");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
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

function normalizeShippingDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return new Date().toISOString();
  }

  const trimmed = value.trim();

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const directDate = new Date(trimmed);
    if (!Number.isNaN(directDate.getTime())) {
      return directDate.toISOString();
    }
  }

  const normalized = trimmed.replace(/\//g, "-").replace(" ", "T");
  const [datePart, rawTimePart = "00:00"] = normalized.split("T");
  const [year = "", month = "", day = ""] = datePart.split("-");
  const [hour = "00", minute = "00"] = rawTimePart.split(":");

  const safeYear = year.padStart(4, "0");
  const safeMonth = month.padStart(2, "0");
  const safeDay = day.padStart(2, "0");
  const safeHour = hour.padStart(2, "0");
  const safeMinute = minute.padStart(2, "0");

  if (!safeYear || !safeMonth || !safeDay) {
    return new Date().toISOString();
  }

  const isoValue = `${safeYear}-${safeMonth}-${safeDay}T${safeHour}:${safeMinute}:00+09:00`;
  const date = new Date(isoValue);

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function formatDateTime(value: string | null) {
  if (!value) return "未設定";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildShippingLineMessage(params: {
  customerName: string;
  shippingCompany: string;
  trackingNumber: string;
  shippedAt: string | null;
}) {
  return `${params.customerName}様

ネイルチップを発送しました💅

【発送情報】
配送会社：${params.shippingCompany || "未設定"}
追跡番号：${params.trackingNumber || "未設定"}
発送日時：${formatDateTime(params.shippedAt)}

到着まで今しばらくお待ちください。
よろしくお願いいたします。`;
}

async function sendLineMessage(params: {
  lineUserId: string;
  messageText: string;
}) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelAccessToken) {
    return {
      sent: false,
      message: "LINE_CHANNEL_ACCESS_TOKEN が未設定です",
    };
  }

  const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to: params.lineUserId,
      messages: [
        {
          type: "text",
          text: params.messageText,
        },
      ],
    }),
  });

  if (!lineResponse.ok) {
    const errorText = await lineResponse.text();
    console.error("LINEネイルチップ発送通知エラー:", errorText);

    return {
      sent: false,
      message: "発送情報は保存しましたが、LINE通知の送信に失敗しました",
    };
  }

  return {
    sent: true,
    message: "発送情報を保存し、LINE通知を送信しました",
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const shippingCompany = String(body.shippingCompany || "").trim();
    const trackingNumber = String(body.trackingNumber || "").trim();
    const shippedAt = body.shippedAt || new Date().toISOString();

    if (!shippingCompany) {
      return NextResponse.json(
        {
          ok: false,
          error: "配送会社を入力してください",
        },
        { status: 400 }
      );
    }

    if (!trackingNumber) {
      return NextResponse.json(
        {
          ok: false,
          error: "追跡番号を入力してください",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: orderData, error: orderFetchError } = await supabase
      .from("nail_tip_orders")
      .select("*")
      .eq("id", id)
      .single();

    if (orderFetchError || !orderData) {
      return NextResponse.json(
        {
          ok: false,
          error: "ネイルチップ注文が見つかりません",
        },
        { status: 404 }
      );
    }

    const order = orderData as AnyRow;

    const { error: updateError } = await supabase
      .from("nail_tip_orders")
      .update({
        shipping_company: shippingCompany,
        tracking_number: trackingNumber,
        shipped_at: shippedAt,
        status: "shipped",
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          error: updateError.message,
        },
        { status: 500 }
      );
    }

    const customerId = getString(order, ["customer_id"]);

    if (!customerId) {
      return NextResponse.json({
        ok: true,
        lineSent: false,
        message:
          "発送情報を保存しました。顧客IDがないためLINE通知はスキップしました。",
      });
    }

    const { data: customerData } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .maybeSingle();

    const customer = (customerData || null) as AnyRow | null;
    const lineUserId = getString(customer, ["line_user_id"]);
    const customerName =
      getString(customer, ["name", "customer_name"]) || "お客様";

    if (!lineUserId) {
      return NextResponse.json({
        ok: true,
        lineSent: false,
        message:
          "発送情報を保存しました。顧客の line_user_id が未登録のためLINE通知はスキップしました。",
      });
    }

    const messageText = buildShippingLineMessage({
      customerName,
      shippingCompany,
      trackingNumber,
      shippedAt,
    });

    const lineResult = await sendLineMessage({
      lineUserId,
      messageText,
    });

    return NextResponse.json({
      ok: true,
      lineSent: lineResult.sent,
      message: lineResult.message,
    });
  } catch (error) {
    console.error("nail-tip shipping error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "発送情報保存失敗",
      },
      { status: 500 }
    );
  }
}