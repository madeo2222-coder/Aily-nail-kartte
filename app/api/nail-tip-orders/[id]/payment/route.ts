import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase環境変数不足");
  }

  return createClient(url, key);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const body = await request.json();

    const paymentUrl = String(body.paymentUrl || "");
    const transactionId = String(body.transactionId || "");
    const paymentDueAt = body.paymentDueAt || null;

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