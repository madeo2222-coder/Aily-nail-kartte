import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

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

function toUtcRangeFromJstDate(dateText: string) {
  const start = new Date(`${dateText}T00:00:00+09:00`);
  const end = new Date(`${dateText}T23:59:59.999+09:00`);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
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

function getTargetDateFromRequest(request: Request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("targetDate");

  if (fromQuery) return fromQuery;

  return getTomorrowJstDate();
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

async function runReminder(targetDate: string) {
  const { startIso, endIso } = toUtcRangeFromJstDate(targetDate);
  const supabaseAdmin = getSupabaseAdmin();

  const { data: reservations, error } = await supabaseAdmin
    .from("reservations")
    .select("*")
    .eq("status", "confirmed")
    .gte("start_at", startIso)
    .lte("start_at", endIso)
    .order("start_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 }
    );
  }

  let sentCount = 0;
  let skippedCount = 0;
  const results: string[] = [];

  for (const reservation of (reservations || []) as AnyRow[]) {
    const reservationId = getString(reservation, ["id"]);
    const customerId = getString(reservation, ["customer_id"]);
    const staffId = getString(reservation, ["staff_id"]);
    const salonId = getString(reservation, ["salon_id"]);

    if (!customerId) {
      skippedCount += 1;
      results.push(`${reservationId || "予約ID不明"}：customer_idなし`);
      continue;
    }

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("id", customerId)
      .maybeSingle();

    if (customerError || !customer) {
      skippedCount += 1;
      results.push(`${reservationId || "予約ID不明"}：顧客取得失敗`);
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

    const { data: staff } = staffId
      ? await supabaseAdmin
          .from("staffs")
          .select("id, name")
          .eq("id", staffId)
          .maybeSingle()
      : { data: null };

    const { data: salon } = salonId
      ? await supabaseAdmin
          .from("salons")
          .select("id, name")
          .eq("id", salonId)
          .maybeSingle()
      : { data: null };

    const staffRow = (staff || null) as AnyRow | null;
    const salonRow = (salon || null) as AnyRow | null;

    const text = buildReminderMessage({
      customerName,
      salonName: getString(salonRow, ["name"]) || "Aily Nail Studio",
      menuName:
        getString(reservation, ["menu", "menu_name"]) || "メニュー未設定",
      staffName: getString(staffRow, ["name"]) || "指名なし",
      startAt: formatDateTime(getString(reservation, ["start_at"])),
    });

    await pushLineMessage(lineUserId, text);

    sentCount += 1;
    results.push(`${customerName}：送信済み`);
  }

  return NextResponse.json({
    ok: true,
    targetDate,
    total: reservations?.length || 0,
    sentCount,
    skippedCount,
    results,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      targetDate?: string;
    };

    return await runReminder(body.targetDate || getTomorrowJstDate());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "前日リマインドLINE送信エラー";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    return await runReminder(getTargetDateFromRequest(request));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "前日リマインドLINE送信エラー";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}