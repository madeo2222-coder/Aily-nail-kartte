import { NextResponse } from "next/server";

function getFromEmail() {
  return (
    process.env.RESEND_FROM_EMAIL ||
    "Aily Nail Studio <onboarding@resend.dev>"
  );
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

async function sendEmail(params: {
  to: string[];
  subject: string;
  text: string;
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

async function sendAdminMail(params: {
  customerName: string;
  customerEmail: string;
  country: string;
  instagramId: string;
  language: string;
  designRequest: string;
  imageUrls: string[];
}) {
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
  });
}

async function sendCustomerConfirmationMail(params: {
  customerName: string;
  customerEmail: string;
  country: string;
  instagramId: string;
  language: string;
  designRequest: string;
  imageUrls: string[];
}) {
  const text = [
    `Dear ${params.customerName},`,
    "",
    "Thank you for your custom nail tips request at Aily Nail Studio.",
    "We have received your request with the details below.",
    "",
    `Country: ${params.country}`,
    `Instagram ID: ${params.instagramId || "-"}`,
    `Language: ${params.language}`,
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
    "For anime or character nail tips, we may ask you to send additional reference images before making an estimate.",
    "",
    "Aily Nail Studio",
  ].join("\n");

  await sendEmail({
    to: [params.customerEmail],
    subject: "Aily Nail Studio - Custom nail tips request received",
    text,
  });
}

async function sendAdminLine(params: {
  customerName: string;
  customerEmail: string;
  country: string;
  instagramId: string;
  language: string;
  designRequest: string;
  imageUrls: string[];
}) {
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const customerName = String(body.customerName || "").trim();
    const customerEmail = String(body.customerEmail || "").trim();
    const country = String(body.country || "").trim();
    const instagramId = String(body.instagramId || "").trim();
    const language = String(body.language || "en").trim();
    const designRequest = String(body.designRequest || "").trim();
    const imageUrls = normalizeImageUrls(body.imageUrls);

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

    if (!designRequest) {
      return NextResponse.json(
        { ok: false, error: "Design request is required." },
        { status: 400 }
      );
    }

    await Promise.allSettled([
      sendAdminMail({
        customerName,
        customerEmail,
        country,
        instagramId,
        language,
        designRequest,
        imageUrls,
      }),
      sendCustomerConfirmationMail({
        customerName,
        customerEmail,
        country,
        instagramId,
        language,
        designRequest,
        imageUrls,
      }),
      sendAdminLine({
        customerName,
        customerEmail,
        country,
        instagramId,
        language,
        designRequest,
        imageUrls,
      }),
    ]);

    return NextResponse.json({
      ok: true,
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