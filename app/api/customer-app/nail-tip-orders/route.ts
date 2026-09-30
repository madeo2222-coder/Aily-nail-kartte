import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  requireCustomerLineSession,
} from "@/lib/server/requireCustomerLineSession";

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomerLineSession(request);

    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "LINEログインが必要です", orders: [] },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("nail_tip_orders")
      .select(
        `
        id,
        design_request,
        payment_url,
        payment_due_at,
        payment_status,
        status,
        created_at
      `
      )
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          orders: [],
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      orders: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "ネイルチップ注文取得に失敗しました",
        orders: [],
      },
      { status: 500 }
    );
  }
}
