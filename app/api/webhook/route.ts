import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createClient(url, key);
}

function extractCustomerIdFromText(text: string) {
  const match = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );

  return match ? match[0] : "";
}

async function replyLineMessage(replyToken: string, text: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!accessToken || !replyToken) return;

  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("LINE返信エラー:", errorText);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const events = body.events || [];
    const supabase = getSupabaseAdmin();

    for (const event of events) {
      const lineUserId = event.source?.userId || "";
      const messageText = event.message?.text || "";
      const replyToken = event.replyToken || "";

      if (!lineUserId || !messageText) continue;

      const customerId = extractCustomerIdFromText(messageText);

      // 会員番号が入っていない普通の会話には絶対に返信しない
      if (!customerId) {
        console.log("通常メッセージのためスキップ");
        continue;
      }

      const { data: customer, error: selectError } = await supabase
        .from("customers")
        .select("id, name, line_user_id")
        .eq("id", customerId)
        .maybeSingle();

      if (selectError) {
        console.error("customers検索エラー:", selectError);
        continue;
      }

      if (!customer) {
        console.log("該当顧客なし:", customerId);
        continue;
      }

      const { error: updateError } = await supabase
        .from("customers")
        .update({
          line_user_id: lineUserId,
        })
        .eq("id", customer.id);

      if (updateError) {
        console.error("line_user_id保存エラー:", updateError);
        continue;
      }

      console.log("line_user_id保存完了:", {
        customerId: customer.id,
        name: customer.name,
        lineUserId,
      });

      if (replyToken) {
        await replyLineMessage(
          replyToken,
          `${customer.name || "お客様"}のLINE通知連携が完了しました。\n予約確定やお知らせをこちらのLINEにお送りします。`
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("LINE WEBHOOK ERROR", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}