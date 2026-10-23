import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

const NOTIFICATION_TYPE = "google_review_request";
const DEFAULT_GOOGLE_REVIEW_URL = "https://g.page/r/CQnXZYS7huDFEBM/review";
const LINE_REQUEST_TIMEOUT_MS = 10_000;

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

function isValidTargetDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;
}

function getTargetDateFromRequest(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("targetDate")?.trim() || getJstDateDaysAgo(3);
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

function createLineRetryKey(parts: string[]) {
  const hex = createHash("sha256").update(parts.join("\u001f")).digest("hex");
  const variant = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function getVisitSnapshot(row: AnyRow) {
  return JSON.stringify({
    id: getString(row, ["id"]),
    salonId: getString(row, ["salon_id"]),
    customerId: getString(row, ["customer_id"]),
    visitDate: getString(row, ["visit_date"]),
  });
}

async function pushLineMessage(params: {
  lineUserId: string;
  text: string;
  retryKey: string;
}) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定です");
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
        "X-Line-Retry-Key": params.retryKey,
      },
      body: JSON.stringify({
        to: params.lineUserId,
        messages: [{ type: "text", text: params.text }],
      }),
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
    });
    const alreadyAccepted = response.status === 409 &&
      Boolean(response.headers.get("x-line-accepted-request-id")?.trim());
    if (response.ok || alreadyAccepted) {
      return { accepted: true, alreadyAccepted, status: "sent" as const };
    }

    const errorText = (await response.text().catch(() => "")).slice(0, 500);
    console.error("Google口コミLINE送信エラー:", response.status, errorText);
    return {
      accepted: false,
      alreadyAccepted: false,
      status: response.status >= 500 ? ("failed_retryable" as const) : ("failed" as const),
    };
  } catch (error) {
    console.error("Google口コミLINE送信結果不明:", error);
    return { accepted: false, alreadyAccepted: false, status: "unknown" as const };
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
    return { alreadySent: false, checkFailed: true };
  }
  return { alreadySent: Boolean(data), checkFailed: false };
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
    .insert([{
      customer_id: params.customerId,
      visit_id: params.visitId,
      notification_type: NOTIFICATION_TYPE,
      target_date: params.targetDate,
      line_user_id: params.lineUserId,
      message: params.message,
    }]);
  if (error) {
    console.error("LINE通知ログ保存エラー:", error);
    return false;
  }
  return true;
}

async function runGoogleReviewRequest(targetDate: string, salonId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: salon, error: salonError } = await supabaseAdmin
    .from("salons")
    .select("id, google_review_url")
    .eq("id", salonId)
    .maybeSingle();
  if (salonError || !salon) {
    return NextResponse.json(
      { ok: false, message: "店舗情報の取得に失敗しました。" },
      { status: 500 }
    );
  }

  const googleReviewUrl =
    getString(salon as AnyRow, ["google_review_url"]) ||
    DEFAULT_GOOGLE_REVIEW_URL;
  const { data: visits, error } = await supabaseAdmin
    .from("visits")
    .select("id, salon_id, customer_id, visit_date")
    .eq("salon_id", salonId)
    .eq("visit_date", targetDate)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json(
      { ok: false, message: "来店情報の取得に失敗しました。" },
      { status: 500 }
    );
  }

  let sentCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;
  let unrecordedCount = 0;
  let recoveredCount = 0;
  const results: string[] = [];

  for (const visit of (visits || []) as AnyRow[]) {
    const visitId = getString(visit, ["id"]);
    const customerId = getString(visit, ["customer_id"]);
    if (!visitId || !customerId || getString(visit, ["salon_id"]) !== salonId) {
      skippedCount += 1;
      results.push(`${visitId || "来店ID不明"}：顧客またはサロン紐付け不備`);
      continue;
    }

    const deliveryState = await hasAlreadySent({ supabaseAdmin, visitId, targetDate });
    if (deliveryState.checkFailed) {
      skippedCount += 1;
      results.push(`${visitId}：送信履歴を確認できないためスキップ`);
      continue;
    }
    if (deliveryState.alreadySent) {
      duplicateCount += 1;
      results.push(`${visitId}：送信済みのためスキップ`);
      continue;
    }

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("id", customerId)
      .eq("salon_id", salonId)
      .maybeSingle();
    if (customerError || !customer) {
      skippedCount += 1;
      results.push(`${visitId}：顧客取得失敗`);
      continue;
    }

    const customerRow = customer as AnyRow;
    const lineUserId = getString(customerRow, ["line_user_id"]);
    const customerName = getString(customerRow, ["name"]) || "お客様";
    if (!lineUserId) {
      skippedCount += 1;
      results.push(`${customerName}：LINE未連携`);
      continue;
    }

    const { data: latestVisit, error: latestError } = await supabaseAdmin
      .from("visits")
      .select("id, salon_id, customer_id, visit_date")
      .eq("id", visitId)
      .eq("salon_id", salonId)
      .maybeSingle();
    if (latestError || !latestVisit ||
      getVisitSnapshot(latestVisit as AnyRow) !== getVisitSnapshot(visit)) {
      skippedCount += 1;
      results.push(`${visitId}：来店内容が変更されたためスキップ`);
      continue;
    }

    const text = buildGoogleReviewMessage({ customerName, googleReviewUrl });
    const retryKey = createLineRetryKey([NOTIFICATION_TYPE, visitId, targetDate]);
    const delivery = await pushLineMessage({ lineUserId, text, retryKey });
    if (!delivery.accepted) {
      failedCount += 1;
      results.push(delivery.status === "unknown"
        ? `${customerName}：送信結果不明（再実行時も同じ重複防止キーを使用）`
        : `${customerName}：LINE送信失敗`);
      continue;
    }

    const recorded = await saveNotificationLog({
      supabaseAdmin,
      customerId,
      visitId,
      targetDate,
      lineUserId,
      message: text,
    });
    sentCount += 1;
    if (delivery.alreadyAccepted) recoveredCount += 1;
    if (!recorded) {
      unrecordedCount += 1;
      results.push(`${customerName}：LINE受付済み・送信記録保存失敗`);
      continue;
    }
    results.push(delivery.alreadyAccepted
      ? `${customerName}：既受付の送信を重複させず記録`
      : `${customerName}：送信済み`);
  }

  return NextResponse.json({
    ok: failedCount === 0 && unrecordedCount === 0,
    targetDate,
    total: visits?.length || 0,
    sentCount,
    skippedCount,
    duplicateCount,
    failedCount,
    unrecordedCount,
    recoveredCount,
    results,
  });
}

async function authenticateGoogleReviewRequest() {
  return authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: true,
  });
}

export async function POST(request: Request) {
  const authentication = await authenticateGoogleReviewRequest();
  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, message: authentication.error },
      { status: authentication.status }
    );
  }
  const salonId = authentication.principal.salonId;
  if (!salonId) {
    return NextResponse.json(
      { ok: false, message: "スタッフの所属サロンを確認できません。" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { targetDate?: unknown };
    const targetDate = body.targetDate === undefined
      ? getJstDateDaysAgo(3)
      : typeof body.targetDate === "string" ? body.targetDate.trim() : "";
    if (!isValidTargetDate(targetDate)) {
      return NextResponse.json(
        { ok: false, message: "対象日はYYYY-MM-DD形式で指定してください。" },
        { status: 400 }
      );
    }
    return await runGoogleReviewRequest(targetDate, salonId);
  } catch (error) {
    console.error("Google口コミLINE処理エラー:", error);
    return NextResponse.json(
      { ok: false, message: "Google口コミLINE処理に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const authentication = await authenticateGoogleReviewRequest();
  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, message: authentication.error },
      { status: authentication.status }
    );
  }
  const salonId = authentication.principal.salonId;
  if (!salonId) {
    return NextResponse.json(
      { ok: false, message: "スタッフの所属サロンを確認できません。" },
      { status: 403 }
    );
  }

  try {
    const targetDate = getTargetDateFromRequest(request);
    if (!isValidTargetDate(targetDate)) {
      return NextResponse.json(
        { ok: false, message: "対象日はYYYY-MM-DD形式で指定してください。" },
        { status: 400 }
      );
    }
    return await runGoogleReviewRequest(targetDate, salonId);
  } catch (error) {
    console.error("Google口コミLINE処理エラー:", error);
    return NextResponse.json(
      { ok: false, message: "Google口コミLINE処理に失敗しました。" },
      { status: 500 }
    );
  }
}
