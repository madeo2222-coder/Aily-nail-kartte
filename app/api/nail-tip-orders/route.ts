import { NextRequest, NextResponse } from "next/server";
import { getNailTipProduct } from "@/lib/nail-tip-products/catalog";
import {
  getSupabaseAdmin,
  requireCustomerLineSession,
} from "@/lib/server/requireCustomerLineSession";

export async function POST(request: NextRequest) {
  let customer: Awaited<ReturnType<typeof requireCustomerLineSession>>;

  try {
    customer = await requireCustomerLineSession(request);
  } catch {
    return NextResponse.json(
      { ok: false, error: "顧客認証の確認に失敗しました" },
      { status: 500 }
    );
  }

  if (!customer) {
    return NextResponse.json(
      { ok: false, error: "LINEログインが必要です" },
      { status: 401 }
    );
  }

  if (!customer.salonId) {
    return NextResponse.json(
      { ok: false, error: "所属店舗を確認できません" },
      { status: 409 }
    );
  }

  try {
    const body = await request.json();

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
        salon_id: customer.salonId,
        customer_id: customer.id,
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
