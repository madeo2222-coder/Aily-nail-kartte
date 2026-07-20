import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/server/requireStaffSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RpcError = {
  code?: string;
  message?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase configuration is missing");
  }

  return createClient(url, serviceRoleKey, {
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
    throw new Error("Application URL is missing");
  }

  const normalized = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `https://${rawUrl}`;
  const url = new URL(normalized);

  if (url.protocol !== "https:") {
    throw new Error("Application URL must use HTTPS");
  }

  return normalized.replace(/\/+$/, "");
}

function hashPaymentLinkKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function getRpcErrorStatus(error: RpcError) {
  if (error.code === "P0002") return 404;
  if (error.code === "P0001") return 409;
  if (error.code === "22023") return 400;
  return 500;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireStaffSession(request);

    if (authError) {
      return authError;
    }

    if (process.env.VERITRANS_DUMMY?.trim() !== "1") {
      return NextResponse.json(
        { ok: false, error: "本番カード決済は現在準備中です。" },
        { status: 503 }
      );
    }

    const { id } = await params;

    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { ok: false, error: "注文IDを確認できません。" },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
    const paymentLinkKey = randomBytes(32).toString("base64url");
    const paymentLinkTokenHash = hashPaymentLinkKey(paymentLinkKey);
    const paymentPath = `/nail-tip-order-pay/${encodeURIComponent(id)}`;
    const storedPaymentUrl = `${appUrl}${paymentPath}`;
    const paymentUrl = `${storedPaymentUrl}?key=${encodeURIComponent(
      paymentLinkKey
    )}`;
    const paymentDueAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc(
      "prepare_nail_tip_order_payment_link",
      {
        p_nail_tip_order_id: id,
        p_payment_url: storedPaymentUrl,
        p_payment_link_token_hash: paymentLinkTokenHash,
        p_payment_due_at: paymentDueAt,
      }
    );

    if (error) {
      const status = getRpcErrorStatus(error);
      const errorMessage =
        status === 404
          ? "注文が見つかりません。"
          : status === 409
            ? "この注文は支払済み、または決済処理中です。"
            : status === 400
              ? "商品コードまたは確定価格が設定されていません。"
              : "決済URLを生成できませんでした。";

      return NextResponse.json(
        { ok: false, error: errorMessage },
        { status }
      );
    }

    if (data !== id) {
      return NextResponse.json(
        { ok: false, error: "決済URLを生成できませんでした。" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentUrl,
      paymentDueAt,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "決済URLを生成できませんでした。" },
      { status: 500 }
    );
  }
}
