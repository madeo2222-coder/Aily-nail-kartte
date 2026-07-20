import { createLogger } from "winston";
import { Transaction } from "tg-mdk-node/dist/tgMdk/Transaction.js";
import { MerchantConfig } from "tg-mdk-node/dist/tgMdk/MerchantConfig.js";
import { CardAuthorizeRequestDto } from "tg-mdk-node/dist/tgMdkDto/Card/CardAuthorizeRequestDto.js";
import { CardAuthorizeResponseDto } from "tg-mdk-node/dist/tgMdkDto/Card/CardAuthorizeResponseDto.js";

const CARD_AUTHORIZE_SUCCESS_CODE = "A001000000000000";

const silentLogger = createLogger({
  silent: true,
  transports: [],
});

type CardAuthorizeParams = {
  merchantCcid: string;
  merchantSecret: string;
  dummy: string;
  orderId: string;
  amount: number;
  token: string;
};

export type CardAuthorizeResult = {
  succeeded: boolean;
  pending: string | null;
  mstatus: string | null;
  vResultCode: string | null;
  merrMsg: string | null;
  responseOrderId: string | null;
};

function normalizeMdkValue(value: string | undefined, maxLength: number) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export async function executeCardAuthorize(
  params: CardAuthorizeParams
): Promise<CardAuthorizeResult> {
  const merchantConfig = new MerchantConfig(
    params.merchantCcid,
    params.merchantSecret,
    params.dummy
  );
  const transaction = new Transaction(silentLogger, merchantConfig);
  const request = new CardAuthorizeRequestDto();

  request.orderId = params.orderId;
  request.amount = String(params.amount);
  request.token = params.token;
  request.withCapture = "true";

  const response = await transaction.execute(
    request,
    CardAuthorizeResponseDto
  );

  const mstatus = normalizeMdkValue(response.mstatus, 100);
  const pending = normalizeMdkValue(response.pending, 20);
  const responseOrderId = normalizeMdkValue(response.orderId, 100);
  const vResultCode = normalizeMdkValue(response.vResultCode, 100);
  const merrMsg = normalizeMdkValue(response.merrMsg, 1000);

  return {
    succeeded:
      mstatus === "success" &&
      pending === "0" &&
      responseOrderId === params.orderId &&
      vResultCode === CARD_AUTHORIZE_SUCCESS_CODE,
    pending,
    mstatus,
    vResultCode,
    merrMsg,
    responseOrderId,
  };
}
