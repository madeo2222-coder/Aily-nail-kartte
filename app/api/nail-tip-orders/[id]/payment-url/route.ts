import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/server/requireStaffSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");

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
  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Application URL is invalid");
  }

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
  let stage = "request-validation";

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

    stage = "application-url";
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
    stage = "supabase-client";
    const supabase = getSupabaseAdmin();

    stage = "prepare-payment-link-rpc";
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
        error.message || "prepare_nail_tip_order_payment_link RPC failed";

      console.error("DG payment URL RPC error", {
        stage,
        status,
        code: error.code || null,
        message: error.message || null,
        details: error.details || null,
        hint: error.hint || null,
      });

      return NextResponse.json(
        {
          ok: false,
          error: errorMessage,
          errorCode: error.code || "RPC_ERROR",
          stage,
        },
        { status }
      );
    }

    if (data !== id) {
      console.error("DG payment URL RPC returned an unexpected result", {
        stage,
        status: 500,
        resultType: typeof data,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "prepare_nail_tip_order_payment_link RPC returned an unexpected result",
          errorCode: "UNEXPECTED_RPC_RESULT",
          stage,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentUrl,
      paymentDueAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown payment URL error";

    console.error("DG payment URL generation error", {
      stage,
      status: 500,
      name: error instanceof Error ? error.name : "UnknownError",
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
        errorCode: "PAYMENT_URL_GENERATION_ERROR",
        stage,
      },
      { status: 500 }
    );
  }
}
