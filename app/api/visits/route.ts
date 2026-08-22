import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_POSTGRES_INTEGER = 2_147_483_647;

const PAYMENT_METHODS = new Set([
  "現金",
  "クレジットカード",
  "PayPay",
  "交通系IC",
  "iD",
  "QUICPay",
  "楽天Edy",
  "WAON",
  "nanaco",
  "UnionPay（銀聯）",
  "Discover",
  "ホットペッパーポイント",
  "割引",
  "その他",
]);

type VisitPayment = {
  method: string;
  amount: number;
};

type VisitRequestBody = {
  reservationId: string | null;
  customerId: string;
  staffId: string | null;
  visitDate: string;
  menuName: string | null;
  color: string | null;
  price: number;
  memo: string | null;
  nextVisitDate: string | null;
  nextProposal: string | null;
  payments: VisitPayment[];
};

type RpcResultRow = {
  visit_id?: unknown;
  reservation_id?: unknown;
  staff_id?: unknown;
  customer_id?: unknown;
  price?: unknown;
  paid_amount?: unknown;
};

const RPC_ERROR_RESPONSES: Record<
  string,
  { status: 400 | 403 | 404 | 409; message: string }
> = {
  VISIT_INVALID_OPERATOR: {
    status: 403,
    message: "この操作を行う権限がありません。",
  },
  VISIT_INVALID_CUSTOMER: {
    status: 404,
    message: "顧客情報を確認できません。",
  },
  VISIT_INVALID_STAFF: {
    status: 404,
    message: "担当スタッフを確認できません。",
  },
  VISIT_INVALID_RESERVATION: {
    status: 404,
    message: "予約情報を確認できません。",
  },
  VISIT_RESERVATION_ALREADY_COMPLETED: {
    status: 409,
    message: "この予約は既に完了しています。",
  },
  VISIT_ALREADY_EXISTS: {
    status: 409,
    message: "この予約には既に来店履歴があります。",
  },
  VISIT_INVALID_INPUT: {
    status: 400,
    message: "入力内容を確認してください。",
  },
  VISIT_INVALID_PAYMENT: {
    status: 400,
    message: "支払い内容を確認してください。",
  },
  VISIT_PAYMENT_TOTAL_MISMATCH: {
    status: 400,
    message: "売上金額と支払い内訳合計を一致させてください。",
  },
  VISIT_COUPON_INSUFFICIENT: {
    status: 409,
    message: "利用できるクーポン残高を確認してください。",
  },
  VISIT_RESERVATION_UPDATE_FAILED: {
    status: 409,
    message: "予約状態が変更されたため登録できませんでした。",
  },
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const monthLengths = [
    31,
    year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= monthLengths[month - 1];
}

function normalizeNullableText(value: unknown) {
  if (value === null) return { ok: true as const, value: null };
  if (typeof value !== "string") return { ok: false as const };

  const normalized = value.trim();
  return { ok: true as const, value: normalized || null };
}

function parsePayments(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false as const };
  }

  const payments: VisitPayment[] = [];

  for (const item of value) {
    if (!isRecord(item) || typeof item.method !== "string") {
      return { ok: false as const };
    }

    const method = item.method.trim();
    const amount = item.amount;

    if (
      !PAYMENT_METHODS.has(method) ||
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      !Number.isSafeInteger(amount) ||
      amount === 0 ||
      (method === "割引" ? amount >= 0 : amount <= 0)
    ) {
      return { ok: false as const };
    }

    payments.push({ method, amount });
  }

  return { ok: true as const, value: payments };
}

function parseRequestBody(value: unknown) {
  if (!isRecord(value)) return { ok: false as const };

  const reservationId = value.reservationId;
  const customerId = value.customerId;
  const staffId = value.staffId;
  const visitDate = value.visitDate;
  const nextVisitDate = value.nextVisitDate;
  const price = value.price;

  if (
    (reservationId !== null && !isUuid(reservationId)) ||
    !isUuid(customerId) ||
    (staffId !== null && !isUuid(staffId)) ||
    !isValidDate(visitDate) ||
    (nextVisitDate !== null && !isValidDate(nextVisitDate)) ||
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    !Number.isSafeInteger(price) ||
    price < 0 ||
    price > MAX_POSTGRES_INTEGER
  ) {
    return { ok: false as const };
  }

  if (
    (reservationId !== null && staffId !== null) ||
    (reservationId === null && staffId === null)
  ) {
    return { ok: false as const };
  }

  const menuName = normalizeNullableText(value.menuName);
  const color = normalizeNullableText(value.color);
  const memo = normalizeNullableText(value.memo);
  const nextProposal = normalizeNullableText(value.nextProposal);
  const payments = parsePayments(value.payments);

  if (
    !menuName.ok ||
    !color.ok ||
    !memo.ok ||
    !nextProposal.ok ||
    !payments.ok
  ) {
    return { ok: false as const };
  }

  const paymentTotal = payments.value.reduce(
    (total, payment) => total + payment.amount,
    0
  );

  if (!Number.isSafeInteger(paymentTotal) || paymentTotal !== price) {
    return { ok: false as const };
  }

  const body: VisitRequestBody = {
    reservationId,
    customerId,
    staffId,
    visitDate,
    menuName: menuName.value,
    color: color.value,
    price,
    memo: memo.value,
    nextVisitDate,
    nextProposal: nextProposal.value,
    payments: payments.value,
  };

  return { ok: true as const, body };
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function parseNumericInteger(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }

  if (typeof value !== "string" || !/^\d+(?:\.0+)?$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseRpcResult(data: unknown, requestBody: VisitRequestBody) {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    return null;
  }

  const row = data[0] as RpcResultRow;
  const price = parseNumericInteger(row.price);
  const paidAmount = parseNumericInteger(row.paid_amount);

  if (
    !isUuid(row.visit_id) ||
    (row.reservation_id !== null && !isUuid(row.reservation_id)) ||
    !isUuid(row.staff_id) ||
    !isUuid(row.customer_id) ||
    price === null ||
    paidAmount === null ||
    row.reservation_id !== requestBody.reservationId ||
    row.customer_id !== requestBody.customerId ||
    price !== requestBody.price ||
    paidAmount !== requestBody.price ||
    (requestBody.reservationId === null && row.staff_id !== requestBody.staffId)
  ) {
    return null;
  }

  return {
    id: row.visit_id,
    reservationId: row.reservation_id,
    staffId: row.staff_id,
    customerId: row.customer_id,
    price,
    paidAmount,
  };
}

export async function POST(request: Request) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: false,
    salonContextRequired: true,
  });

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  if (authentication.principal.authenticationMode !== "supabase") {
    return errorResponse("この操作を行う権限がありません。", 403);
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return errorResponse("入力内容を確認してください。", 400);
  }

  const parsedBody = parseRequestBody(requestBody);
  if (!parsedBody.ok) {
    return errorResponse("入力内容を確認してください。", 400);
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return errorResponse("来店登録を開始できませんでした。", 500);
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("register_staff_visit", {
      p_operator_staff_id: authentication.principal.staffId,
      p_salon_id: authentication.principal.salonId,
      p_reservation_id: parsedBody.body.reservationId,
      p_customer_id: parsedBody.body.customerId,
      p_staff_id: parsedBody.body.staffId,
      p_visit_date: parsedBody.body.visitDate,
      p_menu_name: parsedBody.body.menuName,
      p_color: parsedBody.body.color,
      p_price: parsedBody.body.price,
      p_memo: parsedBody.body.memo,
      p_next_visit_date: parsedBody.body.nextVisitDate,
      p_next_proposal: parsedBody.body.nextProposal,
      p_payments: parsedBody.body.payments,
    });

    if (error) {
      const mappedError = RPC_ERROR_RESPONSES[error.message];

      if (mappedError) {
        return errorResponse(mappedError.message, mappedError.status);
      }

      return errorResponse("来店登録に失敗しました。", 500);
    }

    const visit = parseRpcResult(data, parsedBody.body);
    if (!visit) {
      return errorResponse("来店登録結果を確認できませんでした。", 500);
    }

    return NextResponse.json({ ok: true, visit }, { status: 201 });
  } catch {
    return errorResponse("来店登録に失敗しました。", 500);
  }
}
