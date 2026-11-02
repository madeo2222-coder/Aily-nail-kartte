import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isUuidV4 } from "@/lib/inbound-nail-tip-submission";

function getFromEmail() {
  return (
    process.env.RESEND_FROM_EMAIL ||
    "Aily Nail Studio <onboarding@resend.dev>"
  );
}

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

function normalizeImageUrls(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildImageUrlText(imageUrls: string[]) {
  if (imageUrls.length === 0) return "-";
  return imageUrls.map((url, index) => `${index + 1}. ${url}`).join("\n");
}

function buildShippingText(params: {
  recipientName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingPhone: string;
}) {
  return [
    `Recipient name: ${params.recipientName || "-"}`,
    `Address: ${params.shippingAddress || "-"}`,
    `City: ${params.shippingCity || "-"}`,
    `State / Province: ${params.shippingState || "-"}`,
    `Postal Code: ${params.shippingPostalCode || "-"}`,
    `Phone: ${params.shippingPhone || "-"}`,
  ].join("\n");
}

async function sendEmail(params: {
  to: string[];
  subject: string;
  text: string;
  idempotencyKey: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;

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
      from: getFromEmail(),
      to: params.to,
      subject: params.subject,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("インバウンドネイルチップメール送信エラー:", errorText);
  }
}

type NotifyParams = {
  operationId: string;
  customerName: string;
  customerEmail: string;
  country: string;
  instagramId: string;
  language: string;
  orderType: string;
  designRequest: string;
  imageUrls: string[];
  recipientName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingPhone: string;
};

async function sendAdminMail(params: NotifyParams) {
  const notifyEmail = process.env.RESERVATION_NOTIFY_EMAIL;
  if (!notifyEmail) return;

  const text = [
    "New custom nail tips request.",
    "",
    `Customer name: ${params.customerName}`,
    `Customer email: ${params.customerEmail}`,
    `Country: ${params.country}`,
    `Instagram ID: ${params.instagramId || "-"}`,
    `Language: ${params.language}`,
    `Order Type: ${params.orderType}`,
    "",
    "Shipping information:",
    buildShippingText(params),
    "",
    "Design request:",
    params.designRequest || "-",
    "",
    "Reference images:",
    buildImageUrlText(params.imageUrls),
    "",
    "Worldwide shipping requested.",
  ].join("\n");

  await sendEmail({
    to: [notifyEmail],
    subject: "【Aily Nail Studio】Custom nail tips request",
    text,
    idempotencyKey: `inbound-nail-tip/${params.operationId}/admin-email`,
  });
}

async function sendCustomerConfirmationMail(params: NotifyParams) {
  const text = [
    `Dear ${params.customerName},`,
    "",
    "Thank you for your custom nail tips request at Aily Nail Studio.",
    "We have received your request with the details below.",
    "",
    `Country: ${params.country}`,
    `Instagram ID: ${params.instagramId || "-"}`,
    `Language: ${params.language}`,
    `Order Type: ${params.orderType}`,
    "",
    "Shipping information:",
    buildShippingText(params),
    "",
    "Design request:",
    params.designRequest || "-",
    "",
    "Reference images:",
    buildImageUrlText(params.imageUrls),
    "",
    "Our staff will review your design and contact you with:",
    "- Availability",
    "- Estimated price",
    "- Production time",
    "- Worldwide shipping details",
    "- Payment information",
    "",
    "For anime, character, fortune, Sanmeigaku, or power stone nail tips, we may ask you to send additional reference information before making an estimate.",
    "",
    "Aily Nail Studio",
  ].join("\n");

  await sendEmail({
    to: [params.customerEmail],
    subject: "Aily Nail Studio - Custom nail tips request received",
    text,
    idempotencyKey: `inbound-nail-tip/${params.operationId}/customer-email`,
  });
}

async function sendAdminLine(params: NotifyParams) {
  const lineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const adminUserId = process.env.LINE_ADMIN_USER_ID;

  if (!lineAccessToken || !adminUserId) {
    console.log(
      "インバウンドネイルチップLINE通知スキップ: LINE環境変数未設定"
    );
    return;
  }

  const text = [
    "🌏 Custom nail tips request",
    "",
    `Customer: ${params.customerName}`,
    `Email: ${params.customerEmail}`,
    `Country: ${params.country}`,
    `Instagram: ${params.instagramId || "-"}`,
    `Language: ${params.language}`,
    `Order Type: ${params.orderType}`,
    "",
    "Shipping information:",
    buildShippingText(params),
    "",
    "Design request:",
    params.designRequest || "-",
    "",
    "Reference images:",
    buildImageUrlText(params.imageUrls),
    "",
    "Worldwide shipping requested.",
  ].join("\n");

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineAccessToken}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": params.operationId,
    },
    body: JSON.stringify({
      to: adminUserId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("インバウンドネイルチップLINE通知送信エラー:", errorText);
  }
}

type ExistingRequestRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  country: string | null;
  instagram_id: string | null;
  language: string | null;
  order_type: string | null;
  design_request: string | null;
  image_urls: unknown;
  recipient_name: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_phone: string | null;
};

type NormalizedRequest = {
  customerName: string;
  customerEmail: string;
  country: string;
  instagramId: string;
  language: string;
  orderType: string;
  designRequest: string;
  imageUrls: string[];
  recipientName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingPhone: string;
};

function matchesExistingRequest(
  row: ExistingRequestRow,
  request: NormalizedRequest
) {
  return (
    row.customer_name === request.customerName &&
    row.customer_email === request.customerEmail &&
    row.country === request.country &&
    (row.instagram_id || "") === request.instagramId &&
    row.language === request.language &&
    row.order_type === request.orderType &&
    row.design_request === request.designRequest &&
    JSON.stringify(normalizeImageUrls(row.image_urls)) ===
      JSON.stringify(request.imageUrls) &&
    row.recipient_name === request.recipientName &&
    row.shipping_address === request.shippingAddress &&
    row.shipping_city === request.shippingCity &&
    (row.shipping_state || "") === request.shippingState &&
    row.shipping_postal_code === request.shippingPostalCode &&
    row.shipping_phone === request.shippingPhone
  );
}

export async function GET(request: Request) {
  const operationId = new URL(request.url).searchParams.get("operationId");
  if (!isUuidV4(operationId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid operation ID." },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("inbound_nail_tip_requests")
      .select("id")
      .eq("id", operationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: true, status: "unknown" });
    }
    return NextResponse.json({
      ok: true,
      status: data?.id === operationId ? "saved" : "not_found",
    });
  } catch {
    return NextResponse.json({ ok: true, status: "unknown" });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const requestedOperationId = body.operationId;
    if (requestedOperationId && !isUuidV4(requestedOperationId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid operation ID." },
        { status: 400 }
      );
    }
    const operationId = requestedOperationId || randomUUID();
    const customerName = String(body.customerName || "").trim();
    const customerEmail = String(body.customerEmail || "").trim();
    const country = String(body.country || "").trim();
    const instagramId = String(body.instagramId || "").trim();
    const language = String(body.language || "en").trim();
    const orderType = String(body.orderType || "anime_character").trim();
    const designRequest = String(body.designRequest || "").trim();
    const imageUrls = normalizeImageUrls(body.imageUrls);

    const recipientName = String(body.recipientName || "").trim();
    const shippingAddress = String(body.shippingAddress || "").trim();
    const shippingCity = String(body.shippingCity || "").trim();
    const shippingState = String(body.shippingState || "").trim();
    const shippingPostalCode = String(body.shippingPostalCode || "").trim();
    const shippingPhone = String(body.shippingPhone || "").trim();

    if (!customerName) {
      return NextResponse.json(
        { ok: false, error: "Name is required." },
        { status: 400 }
      );
    }

    if (!customerEmail) {
      return NextResponse.json(
        { ok: false, error: "Email is required." },
        { status: 400 }
      );
    }

    if (!country) {
      return NextResponse.json(
        { ok: false, error: "Country is required." },
        { status: 400 }
      );
    }

    if (!recipientName) {
      return NextResponse.json(
        { ok: false, error: "Recipient name is required." },
        { status: 400 }
      );
    }

    if (!shippingAddress) {
      return NextResponse.json(
        { ok: false, error: "Shipping address is required." },
        { status: 400 }
      );
    }

    if (!shippingCity) {
      return NextResponse.json(
        { ok: false, error: "City is required." },
        { status: 400 }
      );
    }

    if (!shippingPostalCode) {
      return NextResponse.json(
        { ok: false, error: "Postal code is required." },
        { status: 400 }
      );
    }

    if (!shippingPhone) {
      return NextResponse.json(
        { ok: false, error: "Phone number is required." },
        { status: 400 }
      );
    }

    if (!designRequest) {
      return NextResponse.json(
        { ok: false, error: "Design request is required." },
        { status: 400 }
      );
    }

    const normalizedRequest: NormalizedRequest = {
      customerName,
      customerEmail,
      country,
      instagramId,
      language,
      orderType,
      designRequest,
      imageUrls,
      recipientName,
      shippingAddress,
      shippingCity,
      shippingState,
      shippingPostalCode,
      shippingPhone,
    };

    const supabase = getSupabaseAdmin();
    const readExistingRequest = async () => {
      const { data, error } = await supabase
        .from("inbound_nail_tip_requests")
        .select(
          "id, customer_name, customer_email, country, instagram_id, language, order_type, design_request, image_urls, recipient_name, shipping_address, shipping_city, shipping_state, shipping_postal_code, shipping_phone"
        )
        .eq("id", operationId)
        .maybeSingle();
      if (error) return { state: "error" as const, error };
      if (!data) return { state: "missing" as const };
      if (!matchesExistingRequest(data as ExistingRequestRow, normalizedRequest)) {
        return { state: "conflict" as const };
      }
      return { state: "match" as const };
    };

    const existing = await readExistingRequest();
    if (existing.state === "error") {
      return NextResponse.json(
        { ok: false, error: existing.error.message },
        { status: 500 }
      );
    }
    if (existing.state === "conflict") {
      return NextResponse.json(
        { ok: false, error: "Custom request key conflict." },
        { status: 409 }
      );
    }
    if (existing.state === "match") {
      return NextResponse.json({ ok: true, replayed: true, requestId: operationId });
    }

    const { error: insertError } = await supabase
      .from("inbound_nail_tip_requests")
      .insert({
        id: operationId,
        customer_name: customerName,
        customer_email: customerEmail,
        country,
        instagram_id: instagramId || null,
        language,
        order_type: orderType,
        design_request: designRequest,
        image_urls: imageUrls,
        recipient_name: recipientName,
        shipping_address: shippingAddress,
        shipping_city: shippingCity,
        shipping_state: shippingState || null,
        shipping_postal_code: shippingPostalCode,
        shipping_phone: shippingPhone,
        status: "new",
      });

    if (insertError) {
      const reconciliation = await readExistingRequest();
      if (reconciliation.state === "match") {
        return NextResponse.json({
          ok: true,
          replayed: true,
          requestId: operationId,
        });
      }
      if (reconciliation.state === "conflict") {
        return NextResponse.json(
          { ok: false, error: "Custom request key conflict." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    const notifyParams: NotifyParams = {
      operationId,
      customerName,
      customerEmail,
      country,
      instagramId,
      language,
      orderType,
      designRequest,
      imageUrls,
      recipientName,
      shippingAddress,
      shippingCity,
      shippingState,
      shippingPostalCode,
      shippingPhone,
    };

    await Promise.allSettled([
      sendAdminMail(notifyParams),
      sendCustomerConfirmationMail(notifyParams),
      sendAdminLine(notifyParams),
    ]);

    return NextResponse.json({
      ok: true,
      replayed: false,
      requestId: operationId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Custom nail tips request failed.",
      },
      { status: 500 }
    );
  }
}
