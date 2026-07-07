import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

const NOTIFICATION_TYPE = "google_review_request";
const DEFAULT_GOOGLE_REVIEW_URL = "https://g.page/r/CQnXZYS7huDFEBM/review";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase環境変数が不足しています");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function getString(row: AnyRow | null, keys: string[]) {
  if (!row) return "";

  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function getJstDateDaysAgo(daysAgo: number) {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setUTCDate(jst.getUTCDate() - daysAgo);

  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTargetDateFromRequest(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("targetDate") || getJstDateDaysAgo(3);
}

function buildGoogleReviewMessage(params: {
  customerName: string;
  googleReviewUrl: string;
}) {
  return `${params.customerName}様

先日はAily Nail Studioへご来店いただき、ありがとうございました💅

もしネイルにご満足いただけましたら、Google口コミにご協力いただけると大変励みになります✨

▼口コミはこちら
${params.googleReviewUrl}

お忙しいところ恐れ入りますが、よろしくお願いいたします😊

またのご来店を心よりお待ちしております。`;
}

async function pushLineMessage(lineUserId: string, text: string) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定です");
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText);
  }
}

async function hasAlreadySent(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  visitId: string;
  targetDate: string;
}) {
  const { data, error } = await params.supabaseAdmin
    .from("line_notification_logs")
    .select("id")
    .eq("visit_id", params.visitId)
    .eq("notification_type", NOTIFICATION_TYPE)
    .eq("target_date", params.targetDate)
    .maybeSingle();

  if (error) {
    console.error("LINE通知ログ確認エラー:", error);
    return false;
  }

  return Boolean(data);
}

async function saveNotificationLog(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  customerId: string;
  visitId: string;
  targetDate: string;
  lineUserId: string;
  message: string;
}) {
  const { error } = await params.supabaseAdmin
    .from("line_notification_logs")
    .insert([
      {
        customer_id: params.customerId,
        visit_id: params.visitId,
        notification_type: NOTIFICATION_TYPE,
        target_date: params.targetDate,
        line_user_id: params.lineUserId,
        message: params.message,
      },
    ]);

  if (error) {
    console.error("LINE通知ログ保存エラー:", error);
  }
}

async function runGoogleReviewRequest(targetDate: string) {
  const supabaseAdmin = getSupabaseAdmin();
const { data: salon } = await supabaseAdmin
  .from("salons")
  .select("google_review_url")
  .limit(1)
  .maybeSingle();

const googleReviewUrl =
  getString((salon || null) as AnyRow | null, ["google_review_url"]) ||
  DEFAULT_GOOGLE_REVIEW_URL;
  const { data: visits, error } = await supabaseAdmin
    .from("visits")
    .select("*")
    .eq("visit_date", targetDate)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 }
    );
  }

  let sentCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  const results: string[] = [];

  for (const visit of (visits || []) as AnyRow[]) {
    const visitId = getString(visit, ["id"]);
    const customerId = getString(visit, ["customer_id"]);

    if (!visitId || !customerId) {
      skippedCount += 1;
      results.push(`${visitId || "visit_idなし"}：customer_idなし`);
      continue;
    }

    const alreadySent = await hasAlreadySent({
      supabaseAdmin,
      visitId,
      targetDate,
    });

    if (alreadySent) {
      duplicateCount += 1;
      results.push(`${visitId}：送信済みのためスキップ`);
      continue;
    }

    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("id", customerId)
      .maybeSingle();

    const customerRow = (customer || null) as AnyRow | null;
    const lineUserId = getString(customerRow, ["line_user_id"]);
    const customerName = getString(customerRow, ["name"]) || "お客様";

    if (!lineUserId) {
      skippedCount += 1;
      results.push(`${customerName}：LINE未連携`);
      continue;
    }

    const text = buildGoogleReviewMessage({
  customerName,
  googleReviewUrl,
});

    await pushLineMessage(lineUserId, text);

    await saveNotificationLog({
      supabaseAdmin,
      customerId,
      visitId,
      targetDate,
      lineUserId,
      message: text,
    });

    sentCount += 1;
    results.push(`${customerName}：送信済み`);
  }

  return NextResponse.json({
    ok: true,
    targetDate,
    total: visits?.length || 0,
    sentCount,
    skippedCount,
    duplicateCount,
    results,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      targetDate?: string;
    };

    return await runGoogleReviewRequest(
      body.targetDate || getJstDateDaysAgo(3)
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google口コミLINE送信エラー";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    return await runGoogleReviewRequest(getTargetDateFromRequest(request));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google口コミLINE送信エラー";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}