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
  filename?: string | null;
  body?: {
    data?: string | null;
    attachmentId?: string | null;
  } | null;
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

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    })
    .replace(/&#(\d+);/g, (match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function htmlToPlainText(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|table|section|article|h[1-6])\s*>/gi, "\n")
      .replace(/<\/(?:td|th)\s*>/gi, "\t")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function collectMimeText(
  payload: GmailMessagePart | null | undefined,
  mimeType: "text/plain" | "text/html",
  getAttachmentData: (attachmentId: string) => Promise<string | null>
): Promise<string[]> {
  if (!payload) return [];

  if (payload.filename?.trim()) return [];

  if (payload.mimeType === mimeType) {
    const encoded =
      payload.body?.data ||
      (payload.body?.attachmentId
        ? await getAttachmentData(payload.body.attachmentId)
        : null);

    if (!encoded) return [];

    const decoded = decodeBase64Url(encoded);
    return [mimeType === "text/html" ? htmlToPlainText(decoded) : decoded];
  }

  if (Array.isArray(payload.parts)) {
    const values: string[] = [];
    for (const part of payload.parts) {
      values.push(...(await collectMimeText(part, mimeType, getAttachmentData)));
    }
    return values;
  }

  return [];
}

async function extractPlainText(
  payload: GmailMessagePart | null | undefined,
  getAttachmentData: (attachmentId: string) => Promise<string | null>
): Promise<string> {
  const plainText = (await collectMimeText(
    payload,
    "text/plain",
    getAttachmentData
  ))
    .filter((value) => value.trim())
    .join("\n");

  if (plainText) return plainText;

  return (await collectMimeText(payload, "text/html", getAttachmentData))
    .filter((value) => value.trim())
    .join("\n");
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
      threadId: string | null;
      internalDate: number;
      subject: string;
      bodyText: string;
    }
  | {
      ok: false;
      messageId: string;
      threadId: string | null;
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
      internalDate?: string | null;
      payload?: (GmailMessagePart & {
        headers?: Array<{
          name?: string | null;
          value?: string | null;
        }> | null;
      }) | null;
    };
  }>,
  getAttachment: (parameters: {
    userId: string;
    messageId: string;
    id: string;
  }) => Promise<{
    data: {
      data?: string | null;
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
        const threadId = message.threadId || null;
        if (!messageId) {
          return {
            ok: false,
            messageId: "unknown",
            threadId,
            error: "GmailメッセージIDを取得できませんでした",
          };
        }

        try {
          const messageResponse = await getMessage({
            userId: "me",
            id: messageId,
            format: "full",
          });
          const rawInternalDate = messageResponse.data.internalDate;
          const internalDate = Number(rawInternalDate);
          if (
            typeof rawInternalDate !== "string" ||
            !/^\d+$/.test(rawInternalDate) ||
            !Number.isFinite(internalDate) ||
            internalDate < 0
          ) {
            throw new Error("Gmail受信日時を取得できませんでした");
          }
          const subject =
            messageResponse.data.payload?.headers?.find(
              (header) => header.name?.toLowerCase() === "subject"
            )?.value || "";
          const attachmentData = new Map<string, Promise<string | null>>();
          const bodyText = (
            await extractPlainText(
              messageResponse.data.payload,
              (attachmentId) => {
                let pending = attachmentData.get(attachmentId);
                if (!pending) {
                  pending = getAttachment({
                    userId: "me",
                    messageId,
                    id: attachmentId,
                  }).then((response) => response.data.data || null);
                  attachmentData.set(attachmentId, pending);
                }
                return pending;
              }
            )
          ).trim();

          return {
            ok: true,
            messageId,
            threadId,
            internalDate,
            subject,
            bodyText,
          };
        } catch (error) {
          return {
            ok: false,
            messageId,
            threadId,
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

  // Gmail search results are usually newest-first, but the API response order
  // is not a safe event sequence. Apply booking/cancellation messages by the
  // timestamp returned on each full message so later events win reliably.
  return fetchedMessages.sort((left, right) => {
    if (left.ok && right.ok) {
      return left.internalDate - right.internalDate;
    }
    if (left.ok) return -1;
    if (right.ok) return 1;
    return 0;
  });
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
    (parameters) => gmail.users.messages.get(parameters),
    (parameters) => gmail.users.messages.attachments.get(parameters)
  );
  const results = [];
  const failedThreadIds = new Set(
    fetchedMessages.flatMap((message) =>
      !message.ok && message.threadId ? [message.threadId] : []
    )
  );
  const hasUnscopedFetchFailure = fetchedMessages.some(
    (message) => !message.ok && !message.threadId
  );

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

    const { messageId, threadId, subject, bodyText } = message;

    // A reservation/change/cancellation chain is commonly kept in one Gmail
    // thread. If even one message in that thread cannot be read, applying an
    // older readable message can temporarily roll the reservation back. Keep
    // unrelated threads moving, but defer this entire thread until a retry can
    // establish the complete event order.
    if (threadId && failedThreadIds.has(threadId)) {
      results.push({
        messageId,
        subject,
        skipped: false,
        ok: false,
        error:
          "同じGmailスレッドの本文取得に失敗したメールがあるため同期を保留しました。再試行してください。",
      });
      continue;
    }

    if (!isTargetReservationMail(subject, bodyText)) {
      results.push({
        messageId,
        subject,
        skipped: true,
        reason: "HPB/ミニモ予約メールではありません",
      });
      continue;
    }

    // Without a Gmail thread ID, an unreadable message cannot be proven to be
    // unrelated to this reservation. Continuing could apply an older booking
    // while a newer change/cancellation remains unreadable, so defer every
    // target reservation mail until the unknown event can be fetched.
    if (hasUnscopedFetchFailure) {
      results.push({
        messageId,
        subject,
        skipped: false,
        ok: false,
        error:
          "スレッドIDを取得できないGmailメールの本文取得に失敗したため、予約メール全体の同期を保留しました。再試行してください。",
      });
      continue;
    }

    try {
      const synced = await syncHpbMailText(bodyText, subject);

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
