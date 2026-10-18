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
const GMAIL_MESSAGE_FETCH_CONCURRENCY = 5;
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

type FetchedGmailMessage =
  | {
      ok: true;
      messageId: string;
      subject: string;
      bodyText: string;
    }
  | {
      ok: false;
      messageId: string;
      error: string;
    };

async function fetchReservationMessages(
  messages: GmailMessageReference[],
  getMessage: (parameters: {
    userId: string;
    id: string;
    format: "full";
  }) => Promise<{
    data: {
      payload?: (GmailMessagePart & {
        headers?: Array<{
          name?: string | null;
          value?: string | null;
        }> | null;
      }) | null;
    };
  }>
) {
  const fetchedMessages: FetchedGmailMessage[] = [];

  for (
    let offset = 0;
    offset < messages.length;
    offset += GMAIL_MESSAGE_FETCH_CONCURRENCY
  ) {
    const batch = messages.slice(
      offset,
      offset + GMAIL_MESSAGE_FETCH_CONCURRENCY
    );
    const batchResults = await Promise.all(
      batch.map(async (message): Promise<FetchedGmailMessage> => {
        const messageId = message.id;
        if (!messageId) {
          return {
            ok: false,
            messageId: "unknown",
            error: "GmailメッセージIDを取得できませんでした",
          };
        }

        try {
          const messageResponse = await getMessage({
            userId: "me",
            id: messageId,
            format: "full",
          });
          const subject =
            messageResponse.data.payload?.headers?.find(
              (header) => header.name?.toLowerCase() === "subject"
            )?.value || "";
          const bodyText = extractPlainText(
            messageResponse.data.payload
          ).trim();

          return {
            ok: true,
            messageId,
            subject,
            bodyText,
          };
        } catch (error) {
          return {
            ok: false,
            messageId,
            error:
              error instanceof Error
                ? `Gmail本文の取得に失敗しました: ${error.message}`
                : "Gmail本文の取得に失敗しました",
          };
        }
      })
    );

    fetchedMessages.push(...batchResults);
  }

  return fetchedMessages;
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
  const fetchedMessages = await fetchReservationMessages(
    messages,
    (parameters) => gmail.users.messages.get(parameters)
  );
  const results = [];

  for (const message of fetchedMessages) {
    if (!message.ok) {
      results.push({
        messageId: message.messageId,
        subject: "",
        skipped: false,
        ok: false,
        error: message.error,
      });
      continue;
    }

    const { messageId, subject, bodyText } = message;

    if (!isTargetReservationMail(subject, bodyText)) {
      results.push({
        messageId,
        subject,
        skipped: true,
        reason: "HPB/ミニモ予約メールではありません",
      });
      continue;
    }

    try {
      const synced = await syncHpbMailText(bodyText);

      results.push({
        messageId,
        subject,
        skipped: false,
        ok: true,
        parsed: synced.parsed,
        result: synced.result,
      });
    } catch (error) {
      results.push({
        messageId,
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

  const hasFailures = summary.failedCount > 0;
  const partial = hasFailures && summary.syncedCount > 0;

  return NextResponse.json(
    {
      ok: !hasFailures,
      partial,
      count: summary.syncedCount,
      ...summary,
      ...(hasFailures
        ? {
            error: `${summary.failedCount}件の予約メールを同期できませんでした。成功分は反映済みです。失敗内容を確認して再試行してください。`,
          }
        : {}),
      results,
    },
    { status: hasFailures ? (partial ? 207 : 502) : 200 }
  );
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
