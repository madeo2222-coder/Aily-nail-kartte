import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

function getFromEmail() {
  return (
    process.env.RESEND_FROM_EMAIL ||
    "Aily Nail Studio <onboarding@resend.dev>"
  );
}

async function sendShippingMail(params: {
  customerName: string;
  customerEmail: string;
  shippingCompany: string;
  trackingNumber: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.log("発送通知メールスキップ: RESEND_API_KEY 未設定");
    return;
  }

  const text = [
    `Hello ${params.customerName},`,
    "",
    "Your custom nail tips have been shipped.",
    "",
    `Shipping company: ${params.shippingCompany}`,
    `Tracking number: ${params.trackingNumber}`,
    "",
    "Please use the tracking number above to check the delivery status.",
    "",
    "Thank you for your order.",
    "",
    "Aily Nail Studio",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromEmail(),
      to: [params.customerEmail],
      subject: "Aily Nail Studio - Your order has been shipped",
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("発送通知メール送信エラー:", errorText);
  }
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

    if (!shippingCompany) {
      return NextResponse.json(
        { ok: false, error: "配送会社を入力してください" },
        { status: 400 }
      );
    }

    if (!trackingNumber) {
      return NextResponse.json(
        { ok: false, error: "追跡番号を入力してください" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestData, error: fetchError } = await supabase
      .from("inbound_nail_tip_requests")
      .select("customer_name, customer_email")
      .eq("id", id)
      .single();

    if (fetchError || !requestData) {
      return NextResponse.json(
        { ok: false, error: "相談情報が見つかりません" },
        { status: 404 }
      );
    }

    const customerName = requestData.customer_name || "Customer";
    const customerEmail = requestData.customer_email || "";

    if (!customerEmail) {
      return NextResponse.json(
        { ok: false, error: "メールアドレス未登録" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("inbound_nail_tip_requests")
      .update({
        shipping_company: shippingCompany,
        tracking_number: trackingNumber,
        shipped_at: new Date().toISOString(),
        status: "shipped",
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    await sendShippingMail({
      customerName,
      customerEmail,
      shippingCompany,
      trackingNumber,
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "発送情報保存失敗",
      },
      { status: 500 }
    );
  }
}