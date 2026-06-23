import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const allowedStatuses = [
  "new",
  "reviewing",
  "quoted",
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
    const status = String(body.status || "").trim();

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        { ok: false, error: "無効なステータスです" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("inbound_nail_tip_requests")
      .update({ status })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "ステータス更新失敗",
      },
      { status: 500 }
    );
  }
}