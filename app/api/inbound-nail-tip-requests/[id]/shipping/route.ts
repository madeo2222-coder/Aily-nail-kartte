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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const shippingCompany = String(body.shippingCompany || "").trim();
    const trackingNumber = String(body.trackingNumber || "").trim();

    if (!shippingCompany) {
      return NextResponse.json(
        { ok: false, error: "配送会社を入力してください" },
        { status: 400 }
      );
    }

    if (!trackingNumber) {
      return NextResponse.json(
        { ok: false, error: "追跡番号を入力してください" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("inbound_nail_tip_requests")
      .update({
        shipping_company: shippingCompany,
        tracking_number: trackingNumber,
        shipped_at: new Date().toISOString(),
        status: "shipped",
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
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
          error instanceof Error ? error.message : "発送情報保存失敗",
      },
      { status: 500 }
    );
  }
}