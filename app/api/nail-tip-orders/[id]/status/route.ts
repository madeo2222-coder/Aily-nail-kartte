import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const allowedStatuses = [
  "requested",
  "payment_waiting",
  "paid",
  "making",
  "shipped",
  "completed",
  "cancelled",
];

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const status = String(body.status || "");

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          error: "不正なステータスです",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const updateData: {
      status: string;
      payment_status?: string;
    } = {
      status,
    };

    if (status === "payment_waiting") {
      updateData.payment_status = "payment_waiting";
    }

    if (status === "paid") {
      updateData.payment_status = "paid";
    }

    const { error } = await supabase
      .from("nail_tip_orders")
      .update(updateData)
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
        error: e instanceof Error ? e.message : "ステータス更新失敗",
      },
      { status: 500 }
    );
  }
}