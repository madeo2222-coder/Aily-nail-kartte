import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getNailTipProduct } from "@/lib/nail-tip-products/catalog";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createClient(url, key);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const salonId = String(body.salonId || "").trim();
    const customerId = String(body.customerId || "").trim();
    const luckyColor = String(body.luckyColor || "").trim();
    const luckyStone = String(body.luckyStone || "").trim();
    const nailTheme = String(body.nailTheme || "").trim();
    const productCode = String(body.productCode || "").trim();
    const customerDesignRequest = String(body.designRequest || "").trim();
    const sizeStatus = String(body.sizeStatus || "").trim();
    const deliveryRequest = String(body.deliveryRequest || "").trim();

    const product = getNailTipProduct(productCode);

    if (!product) {
      return NextResponse.json(
        { ok: false, error: "選択された商品は注文できません" },
        { status: 400 }
      );
    }

    const designRequest = [
      `選択商品：${product.name}`,
      `価格目安：${product.startingPrice.toLocaleString("ja-JP")}円〜`,
      "正式見積り前",
      "天然石の種類・大きさ・個数、デザイン内容によって価格が変わります。天然石の追加、大粒・希少な天然石、特殊加工には追加料金が発生する場合があります。ご注文内容を確認後、制作前に正式なお見積りをご案内します。",
      `商品ストーン：${product.stone}`,
      `商品テーマ：${product.fortune}`,
      "",
      customerDesignRequest
        ? `デザイン希望：${customerDesignRequest}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const supabase = getSupabaseAdmin();

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
        product_code: product.code,
        product_name_snapshot: product.name,
        product_price: null,
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
