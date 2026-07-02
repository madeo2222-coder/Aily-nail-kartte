import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { syncHpbMailText } from "@/lib/hpb-mail-sync";

const STAFF_SESSION_COOKIE = "staff_session";

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractPlainText(payload: any): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  if (Array.isArray(payload.parts)) {
    return payload.parts.map(extractPlainText).filter(Boolean).join("\n");
  }

  return "";
}

async function runHpbGmailSync() {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_GMAIL_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "GOOGLE_GMAIL_CLIENT_ID / GOOGLE_GMAIL_CLIENT_SECRET / GOOGLE_GMAIL_REDIRECT_URI / GOOGLE_GMAIL_REFRESH_TOKEN を確認してください",
      },
      { status: 500 }
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults: 10,
    q: 'newer_than:30d (from:beauty.hotpepper.jp OR from:salonboard.com OR "SALON BOARD" OR "HOT PEPPER Beauty" OR "予約番号")',
  });

  const messages = listResponse.data.messages || [];
  const results = [];

  for (const message of messages) {
    if (!message.id) continue;

    const messageResponse = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full",
    });

    const subject =
      messageResponse.data.payload?.headers?.find(
        (header) => header.name?.toLowerCase() === "subject"
      )?.value || "";

    const bodyText = extractPlainText(messageResponse.data.payload).trim();

    if (!bodyText.includes("予約番号")) {
      results.push({
        messageId: message.id,
        subject,
        skipped: true,
        reason: "予約番号が本文にありません",
      });
      continue;
    }

    try {
      const synced = await syncHpbMailText(bodyText);

      results.push({
        messageId: message.id,
        subject,
        skipped: false,
        ok: true,
        parsed: synced.parsed,
        result: synced.result,
      });
    } catch (error) {
      results.push({
        messageId: message.id,
        subject,
        skipped: false,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "HPBメール同期に失敗しました",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    count: results.length,
    results,
  });
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV === "production") {
      const auth = request.headers.get("authorization");

      if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    return await runHpbGmailSync();
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "GmailからHPBメール取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const hasStaffSession = cookieStore.has(STAFF_SESSION_COOKIE);

    if (!hasStaffSession) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return await runHpbGmailSync();
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "GmailからHPBメール取得に失敗しました",
      },
      { status: 500 }
    );
  }
}