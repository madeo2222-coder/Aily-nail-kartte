import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const salonId = String(body.salonId || "").trim();
    const customerId = String(body.customerId || "").trim();
    const luckyColor = String(body.luckyColor || "").trim();
    const luckyStone = String(body.luckyStone || "").trim();
    const nailTheme = String(body.nailTheme || "").trim();
    const designRequest = String(body.designRequest || "").trim();
    const sizeStatus = String(body.sizeStatus || "").trim();
    const deliveryRequest = String(body.deliveryRequest || "").trim();

    const { data, error } = await supabase
      .from("nail_tip_orders")
      .insert({
        salon_id: salonId || null,
        customer_id: customerId || null,
        lucky_color: luckyColor,
        lucky_stone: luckyStone,
        nail_theme: nailTheme,
        design_request: designRequest,
        size_status: sizeStatus,
        delivery_request: deliveryRequest,
        status: "requested",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      orderId: data.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "注文保存に失敗しました";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}