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

function isValidPaymentUrl(value: string) {
  if (!value.trim()) return false;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "期限の記載なし";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "期限の記載なし";
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

function buildPaymentLineMessage(params: {
  customerName: string;
  paymentUrl: string;
  paymentDueAt: string | null;
}) {
  return `${params.customerName}様

ネイルチップのご注文ありがとうございます💅

お支払い用URLをご用意しました。

【お支払いURL】
${params.paymentUrl}

【お支払い期限】
${formatDateTime(params.paymentDueAt)}

お支払い確認後、制作を開始いたします。
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
    console.error("LINEネイルチップ決済案内通知エラー:", errorText);

    return {
      sent: false,
      message: "LINE通知の送信に失敗しました",
    };
  }

  return {
    sent: true,
    message: "LINE通知を送信しました",
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const paymentUrl = String(body.paymentUrl || "").trim();
    const transactionId = String(body.transactionId || "").trim();
    const paymentDueAt = body.paymentDueAt || null;

    if (!isValidPaymentUrl(paymentUrl)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "決済URLは https:// または http:// から始まるURLを入力してください",
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

    const { error } = await supabase
      .from("nail_tip_orders")
      .update({
        payment_url: paymentUrl,
        payment_transaction_id: transactionId,
        payment_due_at: paymentDueAt,
        payment_status: "payment_waiting",
        status: "payment_waiting",
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const customerId = getString(order, ["customer_id"]);

    if (!customerId) {
      return NextResponse.json({
        ok: true,
        lineSent: false,
        message: "決済情報を保存しました。顧客IDがないためLINE通知はスキップしました。",
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
          "決済情報を保存しました。顧客の line_user_id が未登録のためLINE通知はスキップしました。",
      });
    }

    const messageText = buildPaymentLineMessage({
      customerName,
      paymentUrl,
      paymentDueAt,
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
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "保存失敗",
      },
      { status: 500 }
    );
  }
}