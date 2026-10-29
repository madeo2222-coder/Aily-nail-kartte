import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

const NOTIFICATION_TYPE = "reservation_reminder";
const LINE_REQUEST_TIMEOUT_MS = 10_000;
const AILY_SALON_ID = "e120ed90-fded-41b8-b3fe-f486e84f2418";
const AILY_SALON_NAME = "Aily Nail Studio";

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

function isConfirmedStatus(status: unknown) {
  const normalized = String(status ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

  return normalized === "confirmed" || normalized === "予約確定";
}

function toUtcRangeFromJstDate(dateText: string) {
  const start = new Date(`${dateText}T00:00:00+09:00`);
  const end = new Date(`${dateText}T23:59:59.999+09:00`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function getTomorrowJstDate() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setUTCDate(jst.getUTCDate() + 1);
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
  return url.searchParams.get("targetDate")?.trim() || getTomorrowJstDate();
}

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function getActiveCronSalonId() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("salons")
    .select("id")
    .eq("id", AILY_SALON_ID)
    .eq("name", AILY_SALON_NAME)
    .eq("status", "active")
    .maybeSingle();

  if (error || getString((data || null) as AnyRow | null, ["id"]) !== AILY_SALON_ID) {
    console.error("予約リマインド対象サロン確認エラー:", error);
    return null;
  }
  return AILY_SALON_ID;
}

function formatDateTime(value: string | null) {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildReminderMessage(params: {
  customerName: string;
  salonName: string;
  menuName: string;
  staffName: string;
  startAt: string;
}) {
  return `${params.customerName}様

明日のご予約のお知らせです💅

【予約内容】
サロン：${params.salonName}
日時：${params.startAt}
メニュー：${params.menuName}
担当：${params.staffName}

ご来店を心よりお待ちしております。`;
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

function getReservationSnapshot(row: AnyRow) {
  return JSON.stringify({
    id: getString(row, ["id"]),
    salonId: getString(row, ["salon_id"]),
    customerId: getString(row, ["customer_id"]),
    staffId: getString(row, ["staff_id"]),
    status: getString(row, ["status"]),
    menu: getString(row, ["menu", "menu_name"]),
    startAt: getString(row, ["start_at"]),
    endAt: getString(row, ["end_at"]),
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
    console.error("LINEリマインド送信エラー:", response.status, errorText);
    return {
      accepted: false,
      alreadyAccepted: false,
      status: response.status >= 500 ? ("failed_retryable" as const) : ("failed" as const),
    };
  } catch (error) {
    console.error("LINEリマインド送信結果不明:", error);
    return { accepted: false, alreadyAccepted: false, status: "unknown" as const };
  }
}

async function hasAlreadySent(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  reservationId: string;
  targetDate: string;
}) {
  const { data, error } = await params.supabaseAdmin
    .from("line_notification_logs")
    .select("id")
    .eq("reservation_id", params.reservationId)
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
  reservationId: string;
  targetDate: string;
  lineUserId: string;
  message: string;
}) {
  const { error } = await params.supabaseAdmin
    .from("line_notification_logs")
    .insert([{
      customer_id: params.customerId,
      reservation_id: params.reservationId,
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

async function runReminder(targetDate: string, salonId: string) {
  const { startIso, endIso } = toUtcRangeFromJstDate(targetDate);
  const supabaseAdmin = getSupabaseAdmin();
  const { data: reservations, error } = await supabaseAdmin
    .from("reservations")
    .select("id, salon_id, customer_id, staff_id, status, menu, menu_name, start_at, end_at")
    .eq("salon_id", salonId)
    .gte("start_at", startIso)
    .lte("start_at", endIso)
    .order("start_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, message: "予約情報の取得に失敗しました。" },
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
  const confirmedReservations = ((reservations || []) as AnyRow[]).filter(
    (reservation) => isConfirmedStatus(reservation.status)
  );

  for (const reservation of confirmedReservations) {
    const reservationId = getString(reservation, ["id"]);
    const customerId = getString(reservation, ["customer_id"]);
    const staffId = getString(reservation, ["staff_id"]);

    if (!reservationId) {
      skippedCount += 1;
      results.push("予約ID不明：スキップ");
      continue;
    }
    if (!customerId || getString(reservation, ["salon_id"]) !== salonId) {
      skippedCount += 1;
      results.push(`${reservationId}：顧客またはサロン紐付け不備`);
      continue;
    }

    const deliveryState = await hasAlreadySent({ supabaseAdmin, reservationId, targetDate });
    if (deliveryState.checkFailed) {
      skippedCount += 1;
      results.push(`${reservationId}：送信履歴を確認できないためスキップ`);
      continue;
    }
    if (deliveryState.alreadySent) {
      duplicateCount += 1;
      results.push(`${reservationId}：送信済みのためスキップ`);
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
      results.push(`${reservationId}：顧客取得失敗`);
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

    const { data: staff, error: staffError } = staffId
      ? await supabaseAdmin.from("staffs").select("id, name")
          .eq("id", staffId).eq("salon_id", salonId).maybeSingle()
      : { data: null, error: null };
    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons").select("id, name").eq("id", salonId).maybeSingle();
    if (staffError || salonError || !salon || (staffId && !staff)) {
      skippedCount += 1;
      results.push(`${reservationId}：店舗または担当者情報の取得失敗`);
      continue;
    }

    const { data: latestReservation, error: latestError } = await supabaseAdmin
      .from("reservations")
      .select("id, salon_id, customer_id, staff_id, status, menu, menu_name, start_at, end_at")
      .eq("id", reservationId)
      .eq("salon_id", salonId)
      .maybeSingle();
    if (latestError || !latestReservation ||
      getReservationSnapshot(latestReservation as AnyRow) !== getReservationSnapshot(reservation)) {
      skippedCount += 1;
      results.push(`${reservationId}：予約内容が変更されたためスキップ`);
      continue;
    }

    const latestRow = latestReservation as AnyRow;
    const text = buildReminderMessage({
      customerName,
      salonName: getString(salon as AnyRow, ["name"]) || "Aily Nail Studio",
      menuName: getString(latestRow, ["menu", "menu_name"]) || "メニュー未設定",
      staffName: getString((staff || null) as AnyRow | null, ["name"]) || "指名なし",
      startAt: formatDateTime(getString(latestRow, ["start_at"])),
    });
    const retryKey = createLineRetryKey([NOTIFICATION_TYPE, reservationId, targetDate]);
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
      reservationId,
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
    total: confirmedReservations.length,
    sentCount,
    skippedCount,
    duplicateCount,
    failedCount,
    unrecordedCount,
    recoveredCount,
    results,
  });
}

async function authenticateReminderRequest() {
  return authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: true,
  });
}

export async function POST(request: Request) {
  const authentication = await authenticateReminderRequest();
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
      ? getTomorrowJstDate()
      : typeof body.targetDate === "string" ? body.targetDate.trim() : "";
    if (!isValidTargetDate(targetDate)) {
      return NextResponse.json(
        { ok: false, message: "対象日はYYYY-MM-DD形式で指定してください。" },
        { status: 400 }
      );
    }
    return await runReminder(targetDate, salonId);
  } catch (error) {
    console.error("予約リマインド処理エラー:", error);
    return NextResponse.json(
      { ok: false, message: "前日リマインドLINE処理に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, message: "Cron認証が必要です。" },
      { status: 401 }
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
    const salonId = await getActiveCronSalonId();
    if (!salonId) {
      return NextResponse.json(
        { ok: false, message: "予約リマインド対象サロンを確認できません。" },
        { status: 503 }
      );
    }
    return await runReminder(targetDate, salonId);
  } catch (error) {
    console.error("予約リマインド処理エラー:", error);
    return NextResponse.json(
      { ok: false, message: "前日リマインドLINE処理に失敗しました。" },
      { status: 500 }
    );
  }
}
