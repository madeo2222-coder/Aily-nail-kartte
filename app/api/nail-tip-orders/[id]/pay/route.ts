import { createHash, randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { executeCardAuthorize } from "@/lib/veritrans/card-authorize";
import { getVeriTransConfig } from "@/lib/veritrans/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type CreatePaymentRow = {
  payment_id: string;
  amount: number;
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

function hashPaymentLinkKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function createVeriTransOrderId(nailTipOrderId: string) {
  const orderPart = nailTipOrderId.replace(/-/g, "").slice(0, 12).toUpperCase();
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  return `NTO-${orderPart}-${timePart}-${randomPart}`;
}

function getCreatePaymentErrorStatus(error: RpcError) {
  if (error.code === "P0002") return 404;
  if (error.code === "22023") return 400;

  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    error.code === "23505" ||
    /already paid|active payment|processing|pending|duplicate|unique/.test(text)
  ) {
    return 409;
  }

  if (/expired|token does not match/.test(text)) {
    return 400;
  }

  return error.code === "P0001" ? 409 : 500;
}

async function recordPaymentResult(params: {
  supabase: SupabaseClient;
  paymentId: string;
  orderId: string;
  status: "pending" | "failed";
  mstatus: string | null;
  vResultCode: string | null;
  merrMsg: string | null;
}) {
  const { error } = await params.supabase.rpc(
    "record_nail_tip_order_payment_result",
    {
      p_payment_id: params.paymentId,
      p_veritrans_order_id: params.orderId,
      p_status: params.status,
      p_mstatus: params.mstatus,
      p_v_result_code: params.vResultCode,
      p_merr_msg: params.merrMsg,
    }
  );

  return !error;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let supabase: SupabaseClient | null = null;
  let paymentId: string | null = null;
  let orderId: string | null = null;

  try {
    if (process.env.VERITRANS_DUMMY?.trim() !== "1") {
      return NextResponse.json(
        { ok: false, error: "本番カード決済は現在準備中です。" },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      token?: unknown;
      paymentLinkKey?: unknown;
    } | null;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const paymentLinkKey =
      typeof body?.paymentLinkKey === "string"
        ? body.paymentLinkKey.trim()
        : "";

    if (
      !token ||
      token.length > 4096 ||
      !/^[A-Za-z0-9_-]{43}$/.test(paymentLinkKey)
    ) {
      return NextResponse.json(
        { ok: false, error: "決済情報を確認できません。" },
        { status: 400 }
      );
    }

    const { id } = await params;

    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { ok: false, error: "注文IDを確認できません。" },
        { status: 400 }
      );
    }

    const veriTransConfig = getVeriTransConfig();
    const paymentLinkTokenHash = hashPaymentLinkKey(paymentLinkKey);
    orderId = createVeriTransOrderId(id);
    supabase = getSupabaseAdmin();

    const { data: createdRows, error: createError } = await supabase.rpc(
      "create_nail_tip_order_payment",
      {
        p_nail_tip_order_id: id,
        p_veritrans_order_id: orderId,
        p_payment_link_token_hash: paymentLinkTokenHash,
      }
    );

    if (createError) {
      const status = getCreatePaymentErrorStatus(createError);
      const errorMessage =
        status === 404
          ? "注文が見つかりません。"
          : status === 409
            ? "このお支払いはすでに処理中または完了しています。"
            : status === 400
              ? "決済リンクが無効または期限切れです。"
              : "決済処理を開始できませんでした。";

      return NextResponse.json(
        { ok: false, error: errorMessage },
        { status }
      );
    }

    const createdPayment = Array.isArray(createdRows)
      ? (createdRows[0] as CreatePaymentRow | undefined)
      : undefined;
    const amount = Number(createdPayment?.amount);

    if (
      !createdPayment ||
      !UUID_PATTERN.test(createdPayment.payment_id) ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        { ok: false, error: "決済処理を開始できませんでした。" },
        { status: 500 }
      );
    }

    paymentId = createdPayment.payment_id;

    let result;

    try {
      result = await executeCardAuthorize({
        merchantCcid: veriTransConfig.merchantCcid,
        merchantSecret: veriTransConfig.merchantSecret,
        dummy: veriTransConfig.dummy,
        orderId,
        amount,
        token,
      });
    } catch {
      const recorded = await recordPaymentResult({
        supabase,
        paymentId,
        orderId,
        status: "failed",
        mstatus: "failure",
        vResultCode: null,
        merrMsg: "MDK execution failed",
      });

      return NextResponse.json(
        {
          ok: false,
          error: recorded
            ? "カード決済サービスと通信できませんでした。"
            : "決済結果の記録に失敗しました。",
        },
        { status: recorded ? 502 : 500 }
      );
    }

    if (result.succeeded) {
      const { error: completeError } = await supabase.rpc(
        "complete_nail_tip_order_payment",
        {
          p_payment_id: paymentId,
          p_veritrans_order_id: orderId,
          p_mstatus: result.mstatus,
          p_v_result_code: result.vResultCode,
          p_merr_msg: result.merrMsg,
        }
      );

      if (completeError) {
        return NextResponse.json(
          { ok: false, error: "決済結果の反映に失敗しました。" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    const resultStatus: "pending" | "failed" =
      result.pending !== null && result.pending !== "0"
        ? "pending"
        : "failed";
    const recorded = await recordPaymentResult({
      supabase,
      paymentId,
      orderId,
      status: resultStatus,
      mstatus: result.mstatus,
      vResultCode: result.vResultCode,
      merrMsg: result.merrMsg,
    });

    if (!recorded) {
      return NextResponse.json(
        { ok: false, error: "決済結果の記録に失敗しました。" },
        { status: 500 }
      );
    }

    if (resultStatus === "pending") {
      return NextResponse.json(
        {
          ok: false,
          error: "カード決済の結果を確認中です。店舗へお問い合わせください。",
        },
        { status: 409 }
      );
    }

    const debugResult = {
      succeeded: result.succeeded,
      responseOrderId: result.responseOrderId,
      merrMsg: result.merrMsg,
    };

    console.error("VeriTrans Card Authorize returned payment failure", {
      mstatus: result.mstatus,
      pending: result.pending,
      vResultCode: result.vResultCode,
      result: debugResult,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "カード決済を完了できませんでした。",
        mstatus: result.mstatus,
        pending: result.pending,
        vResultCode: result.vResultCode,
        result: debugResult,
      },
      { status: 402 }
    );
  } catch {
    if (supabase && paymentId && orderId) {
      await recordPaymentResult({
        supabase,
        paymentId,
        orderId,
        status: "failed",
        mstatus: "failure",
        vResultCode: null,
        merrMsg: "Unexpected payment processing error",
      }).catch(() => false);
    }

    return NextResponse.json(
      { ok: false, error: "カード決済処理でエラーが発生しました。" },
      { status: 500 }
    );
  }
}
