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

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

function extractPhoneFromText(text: string) {
  const normalized = normalizePhone(text);

  const match = normalized.match(/0\d{9,10}/);
  return match ? match[0] : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log("LINE WEBHOOK");
    console.log(JSON.stringify(body, null, 2));

    const events = body.events || [];
    const supabase = getSupabaseAdmin();

    for (const event of events) {
      const lineUserId = event.source?.userId || "";
      const messageText = event.message?.text || "";

      if (!lineUserId) continue;

      console.log("LINE USER ID:", lineUserId);

      const phone = extractPhoneFromText(messageText);

      if (!phone) {
        console.log("電話番号が含まれていないため保存スキップ");
        continue;
      }

      const { data: customers, error: selectError } = await supabase
        .from("customers")
        .select("id, name, phone, line_user_id")
        .eq("phone", phone);

      if (selectError) {
        console.error("customers検索エラー:", selectError);
        continue;
      }

      if (!customers || customers.length === 0) {
        console.log("該当顧客なし:", phone);
        continue;
      }

      if (customers.length > 1) {
        console.log("同一電話番号の顧客が複数あります:", phone);
        continue;
      }

      const customer = customers[0];

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
        phone,
        lineUserId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("LINE WEBHOOK ERROR", error);

    return NextResponse.json({ ok: false }, { status: 500 });
  }
}