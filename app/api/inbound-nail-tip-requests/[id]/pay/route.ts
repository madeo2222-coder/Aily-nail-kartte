import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createLogger } from "winston";
import { Transaction } from "tg-mdk-node/dist/tgMdk/Transaction.js";
import { MerchantConfig } from "tg-mdk-node/dist/tgMdk/MerchantConfig.js";
import { CardAuthorizeRequestDto } from "tg-mdk-node/dist/tgMdkDto/Card/CardAuthorizeRequestDto.js";
import { CardAuthorizeResponseDto } from "tg-mdk-node/dist/tgMdkDto/Card/CardAuthorizeResponseDto.js";
import { getVeriTransConfig } from "@/lib/veritrans/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InboundNailTipRequestRow = {
  id: string;
  quote_amount: number | null;
  payment_status: string | null;
  status: string | null;
};

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARD_AUTHORIZE_SUCCESS_CODE = "A001000000000000";

const mdkLogger = createLogger({
  silent: true,
  transports: [],
});

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

function createOrderId(requestId: string) {
  const requestPart = requestId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12)
    .toUpperCase();
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  return `NT-${requestPart}-${timePart}-${randomPart}`;
}

function normalizeMdkValue(value: string | undefined, maxLength = 1000) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function isPaymentConflict(error: RpcError) {
  if (error.code === "23505" || error.code === "P0001") {
    return true;
  }

  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /active payment|already paid|processing|pending|duplicate|unique/.test(
    text
  );
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
    "record_inbound_nail_tip_payment_result",
    {
      p_payment_id: params.paymentId,
      p_order_id: params.orderId,
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
    const dummyMode = process.env.VERITRANS_DUMMY?.trim();

    if (dummyMode !== "1") {
      return NextResponse.json(
        {
          ok: false,
          error: "本番カード決済は現在準備中です。",
        },
        { status: 503 }
      );
    }

    const veriTransConfig = getVeriTransConfig();

    const body = (await request.json().catch(() => null)) as {
      token?: unknown;
    } | null;
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "カードトークンがありません。",
        },
        { status: 400 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "決済対象を確認できませんでした。",
        },
        { status: 400 }
      );
    }

    supabase = getSupabaseAdmin();

    const { data, error: selectError } = await supabase
      .from("inbound_nail_tip_requests")
      .select("id, quote_amount, payment_status, status")
      .eq("id", id)
      .maybeSingle<InboundNailTipRequestRow>();

    if (selectError) {
      return NextResponse.json(
        {
          ok: false,
          error: "決済情報の確認に失敗しました。",
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: "決済対象が見つかりません。",
        },
        { status: 404 }
      );
    }

    const quoteAmount = Number(data.quote_amount);

    if (!Number.isInteger(quoteAmount) || quoteAmount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "見積金額を確認できません。",
        },
        { status: 400 }
      );
    }

    if (data.payment_status === "paid") {
      return NextResponse.json(
        {
          ok: false,
          error: "このお支払いはすでに完了しています。",
        },
        { status: 409 }
      );
    }

    orderId = createOrderId(data.id);

    const { data: createdPaymentId, error: createPaymentError } =
      await supabase.rpc("create_inbound_nail_tip_payment", {
        p_request_id: data.id,
        p_amount: quoteAmount,
        p_order_id: orderId,
      });

    if (createPaymentError) {
      if (isPaymentConflict(createPaymentError)) {
        return NextResponse.json(
          {
            ok: false,
            error: "このお支払いはすでに処理中または完了しています。",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: "決済処理を開始できませんでした。",
        },
        { status: 500 }
      );
    }

    if (
      typeof createdPaymentId !== "string" ||
      !UUID_PATTERN.test(createdPaymentId)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "決済処理を開始できませんでした。",
        },
        { status: 500 }
      );
    }

    paymentId = createdPaymentId;

    const merchantConfig = new MerchantConfig(
      veriTransConfig.merchantCcid,
      veriTransConfig.merchantSecret,
      veriTransConfig.dummy
    );
    const transaction = new Transaction(mdkLogger, merchantConfig);
    const cardRequest = new CardAuthorizeRequestDto();

    cardRequest.orderId = orderId;
    cardRequest.amount = String(quoteAmount);
    cardRequest.token = token;
    cardRequest.withCapture = "true";

    let responseDto: CardAuthorizeResponseDto;

    try {
      responseDto = await transaction.execute(
        cardRequest,
        CardAuthorizeResponseDto
      );
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
            ? "カード決済を完了できませんでした。"
            : "決済結果の記録に失敗しました。",
        },
        { status: recorded ? 502 : 500 }
      );
    }

    const mstatus = normalizeMdkValue(responseDto.mstatus, 100);
    const pending = normalizeMdkValue(responseDto.pending, 20);
    const responseOrderId = normalizeMdkValue(responseDto.orderId, 100);
    const vResultCode = normalizeMdkValue(responseDto.vResultCode, 100);
    const merrMsg = normalizeMdkValue(responseDto.merrMsg);

    const succeeded =
      mstatus === "success" &&
      pending === "0" &&
      responseOrderId === orderId &&
      vResultCode === CARD_AUTHORIZE_SUCCESS_CODE;

    if (succeeded && vResultCode) {
      const { error: completeError } = await supabase.rpc(
        "complete_inbound_nail_tip_payment",
        {
          p_payment_id: paymentId,
          p_order_id: orderId,
          p_mstatus: mstatus,
          p_v_result_code: vResultCode,
          p_merr_msg: merrMsg,
        }
      );

      if (completeError) {
        return NextResponse.json(
          {
            ok: false,
            error: "決済結果の反映に失敗しました。",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    const resultStatus: "pending" | "failed" =
      pending !== null && pending !== "0" ? "pending" : "failed";
    const recorded = await recordPaymentResult({
      supabase,
      paymentId,
      orderId,
      status: resultStatus,
      mstatus,
      vResultCode,
      merrMsg,
    });

    if (!recorded) {
      return NextResponse.json(
        {
          ok: false,
          error: "決済結果の記録に失敗しました。",
        },
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

    return NextResponse.json(
      {
        ok: false,
        error: "カード決済を完了できませんでした。",
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
      {
        ok: false,
        error: "カード決済処理でエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
