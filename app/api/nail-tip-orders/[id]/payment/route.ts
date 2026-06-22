import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase環境変数不足");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isValidPaymentUrl(value: string) {
  if (!value.trim()) return false;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const paymentUrl = String(body.paymentUrl || "").trim();
    const transactionId = String(body.transactionId || "").trim();
    const paymentDueAt = body.paymentDueAt || null;

    if (!isValidPaymentUrl(paymentUrl)) {
      return NextResponse.json(
        {
          ok: false,
          error: "決済URLは https:// または http:// から始まるURLを入力してください",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("nail_tip_orders")
      .update({
        payment_url: paymentUrl,
        payment_transaction_id: transactionId,
        payment_due_at: paymentDueAt,
        payment_status: "payment_waiting",
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "保存失敗",
      },
      { status: 500 }
    );
  }
}