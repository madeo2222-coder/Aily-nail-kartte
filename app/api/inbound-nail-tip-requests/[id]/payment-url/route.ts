import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
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

function getAppUrl() {
  const rawUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "";

  if (!rawUrl) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL または VERCEL_PROJECT_PRODUCTION_URL が設定されていません"
    );
  }

  const normalizedUrl = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `https://${rawUrl}`;

  return normalizedUrl.replace(/\/+$/, "");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "相談IDがありません",
        },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data: requestData, error: selectError } = await supabase
      .from("inbound_nail_tip_requests")
      .select("id, quote_amount, payment_status, status")
      .eq("id", id)
      .single();

    if (selectError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          error: "相談が見つかりません",
        },
        { status: 404 }
      );
    }

    const quoteAmount = Number(requestData.quote_amount || 0);

    if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "先に見積金額を登録してください",
        },
        { status: 400 }
      );
    }

    if (requestData.payment_status === "paid") {
      return NextResponse.json(
        {
          ok: false,
          error: "この相談はすでに支払済みです",
        },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
    const paymentUrl = `${appUrl}/inbound-nail-tip-pay/${encodeURIComponent(
      id
    )}`;

    const { error: updateError } = await supabase
      .from("inbound_nail_tip_requests")
      .update({
        payment_url: paymentUrl,
        payment_status: "unpaid",
        status: "quoted",
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          error: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentUrl,
    });
  } catch (error) {
    console.error("DG決済URL生成エラー:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "DG決済URL生成失敗",
      },
      { status: 500 }
    );
  }
}