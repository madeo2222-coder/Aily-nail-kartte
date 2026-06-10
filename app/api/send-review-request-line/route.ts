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

function getTodayJstDate() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildReviewMessage(params: {
  customerName: string;
  appUrl: string;
}) {
  return `${params.customerName}様

本日はご来店ありがとうございました💅

本日の施術写真や前回デザインは、マイページから確認できます。

マイページはこちら
${params.appUrl}/customer-app

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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      targetDate?: string;
      customerId?: string;
    };

    const targetDate = body.targetDate || getTodayJstDate();
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://aily-nail-kartte.vercel.app";

    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from("visits")
      .select("*")
      .eq("visit_date", targetDate)
      .order("created_at", { ascending: false });

    if (body.customerId) {
      query = query.eq("customer_id", body.customerId);
    }

    const { data: visits, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    let sentCount = 0;
    let skippedCount = 0;
    const results: string[] = [];

    for (const visit of (visits || []) as AnyRow[]) {
      const customerId = getString(visit, ["customer_id"]);

      if (!customerId) {
        skippedCount += 1;
        results.push("customer_idなし：スキップ");
        continue;
      }

      const { data: customer } = await supabaseAdmin
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      const customerRow = (customer || null) as AnyRow | null;
      const lineUserId = getString(customerRow, ["line_user_id"]);

      if (!lineUserId) {
        skippedCount += 1;
        results.push(`${getString(customerRow, ["name"]) || "顧客未設定"}：LINE未連携`);
        continue;
      }

      const text = buildReviewMessage({
        customerName: getString(customerRow, ["name"]) || "お客様",
        appUrl,
      });

      await pushLineMessage(lineUserId, text);

      sentCount += 1;
      results.push(`${getString(customerRow, ["name"]) || "お客様"}：送信済み`);
    }

    return NextResponse.json({
      ok: true,
      targetDate,
      total: visits?.length || 0,
      sentCount,
      skippedCount,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "来店後LINE送信エラー";

    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    );
  }
}