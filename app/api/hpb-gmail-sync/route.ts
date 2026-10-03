import { google } from "googleapis";
import { NextResponse } from "next/server";
import { syncHpbMailText } from "@/lib/hpb-mail-sync";
import { summarizeGmailSyncResults } from "@/lib/hpb-gmail-sync-summary";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

type GmailMessagePart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailMessagePart[] | null;
};

type GmailMessageReference = {
  id?: string | null;
  threadId?: string | null;
};

const GMAIL_PAGE_SIZE = 100;
const GMAIL_MESSAGE_LIMIT = 500;
const GMAIL_PAGE_LIMIT = 10;
const RESERVATION_MAIL_QUERY =
  'newer_than:30d ("SALON BOARD" OR "HOT PEPPER Beauty" OR "予約番号" OR "ミニモ" OR "minimo" OR "ミニモサロンツール" OR "予約ID")';

function extractPlainText(payload: GmailMessagePart | null | undefined): string {
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

function isTargetReservationMail(subject: string, bodyText: string) {
  const checkText = `${subject}\n${bodyText}`;

  return (
    checkText.includes("予約番号") ||
    checkText.includes("SALON BOARD") ||
    checkText.includes("HOT PEPPER Beauty") ||
    checkText.includes("ミニモ") ||
    checkText.includes("minimo") ||
    checkText.includes("ミニモサロンツール") ||
    checkText.includes("予約ID")
  );
}

async function listReservationMessages(
  listPage: (parameters: {
    userId: string;
    maxResults: number;
    q: string;
    pageToken?: string;
  }) => Promise<{
    data: {
      messages?: GmailMessageReference[] | null;
      nextPageToken?: string | null;
    };
  }>
) {
  const messages: GmailMessageReference[] = [];
  const seenIds = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < GMAIL_PAGE_LIMIT; page += 1) {
    const remaining = GMAIL_MESSAGE_LIMIT - messages.length;
    if (remaining <= 0) {
      throw new Error(
        `予約メールが${GMAIL_MESSAGE_LIMIT}通を超えています。未取得メールを残したまま正常終了しないため同期を停止しました。`
      );
    }

    const response = await listPage({
      userId: "me",
      maxResults: Math.min(GMAIL_PAGE_SIZE, remaining),
      q: RESERVATION_MAIL_QUERY,
      ...(pageToken ? { pageToken } : {}),
    });

    for (const message of response.data.messages || []) {
      if (!message.id || seenIds.has(message.id)) continue;
      seenIds.add(message.id);
      messages.push(message);
    }

    const nextPageToken = response.data.nextPageToken || undefined;
    if (!nextPageToken) {
      return messages.reverse();
    }

    pageToken = nextPageToken;
  }

  throw new Error(
    "予約メールの一覧が10ページを超えています。未取得メールを残したまま正常終了しないため同期を停止しました。"
  );
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

  const messages = await listReservationMessages((parameters) =>
    gmail.users.messages.list(parameters)
  );
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

    if (!isTargetReservationMail(subject, bodyText)) {
      results.push({
        messageId: message.id,
        subject,
        skipped: true,
        reason: "HPB/ミニモ予約メールではありません",
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
            : "予約メール同期に失敗しました",
      });
    }
  }

  const summary = summarizeGmailSyncResults(results);

  return NextResponse.json({
    ok: true,
    count: summary.syncedCount,
    ...summary,
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
            : "Gmailから予約メール取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });

  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, error: authentication.error },
      { status: authentication.status }
    );
  }

  try {
    return await runHpbGmailSync();
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Gmailから予約メール取得に失敗しました",
      },
      { status: 500 }
    );
  }
}
