import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
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

    const paymentUrl = String(body.paymentUrl || "").trim();

    if (!paymentUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "決済URL未入力",
        },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { error } = await supabase
      .from("inbound_nail_tip_requests")
      .update({
        payment_url: paymentUrl,
        payment_status: "unpaid",
        status: "payment_waiting",
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
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "保存失敗",
      },
      { status: 500 }
    );
  }
}