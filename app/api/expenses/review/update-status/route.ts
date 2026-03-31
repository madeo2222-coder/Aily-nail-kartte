import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

type DbReceiptStatus = "has_receipt" | "no_receipt" | "unchecked";
type ReviewStatus = "unreviewed" | "confirmed";

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function toDbReceiptStatus(value: unknown): DbReceiptStatus | undefined {
  if (typeof value !== "string") return undefined;

  switch (value) {
    case "with_receipt":
    case "has_receipt":
    case "あり":
    case "有":
      return "has_receipt";

    case "without_receipt":
    case "no_receipt":
    case "なし":
    case "無":
      return "no_receipt";

    case "unchecked":
    case "未確認":
      return "unchecked";

    default:
      return undefined;
  }
}

function toReviewStatus(value: unknown): ReviewStatus | undefined {
  if (value === "unreviewed" || value === "confirmed") {
    return value;
  }
  return undefined;
}

export async function PATCH(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase環境変数が不足しています。" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);

    const rowId = body?.rowId ?? body?.row_id;

    const receiptStatusRaw =
      body?.receipt_status ?? body?.receiptStatus ?? body?.receipt;

    const duplicateFlagRaw =
      body?.duplicate_flag ?? body?.duplicateFlag ?? body?.duplicate;

    const excludedFlagRaw =
      body?.excluded_flag ?? body?.excludedFlag ?? body?.excluded;

    const reviewStatusRaw =
      body?.review_status ?? body?.reviewStatus ?? body?.status;

    if (!isValidUuid(rowId)) {
      return NextResponse.json(
        { error: "rowId形式が不正です。" },
        { status: 400 }
      );
    }

    const updates: {
      receipt_status?: DbReceiptStatus;
      duplicate_flag?: boolean;
      excluded_flag?: boolean;
      review_status?: ReviewStatus;
    } = {};

    const mappedReceiptStatus = toDbReceiptStatus(receiptStatusRaw);
    if (mappedReceiptStatus !== undefined) {
      updates.receipt_status = mappedReceiptStatus;
    }

    const duplicateFlag = toBoolean(duplicateFlagRaw);
    if (duplicateFlag !== undefined) {
      updates.duplicate_flag = duplicateFlag;
    }

    const excludedFlag = toBoolean(excludedFlagRaw);
    if (excludedFlag !== undefined) {
      updates.excluded_flag = excludedFlag;
    }

    const reviewStatus = toReviewStatus(reviewStatusRaw);
    if (reviewStatus !== undefined) {
      updates.review_status = reviewStatus;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error: "更新対象がありません。",
          received: {
            rowId,
            receiptStatusRaw,
            duplicateFlagRaw,
            excludedFlagRaw,
            reviewStatusRaw,
          },
        },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: currentRow, error: currentRowError } = await supabase
      .from("expense_import_rows")
      .select(
        `
        id,
        receipt_status,
        review_status,
        duplicate_flag,
        matched_expense_id,
        excluded_flag
      `
      )
      .eq("id", rowId)
      .single();

    if (currentRowError || !currentRow) {
      return NextResponse.json(
        {
          error:
            currentRowError?.message || "対象のreview行が見つかりません。",
        },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("expense_import_rows")
      .update(updates)
      .eq("id", rowId)
      .select(
        `
        id,
        import_id,
        expense_date,
        amount,
        vendor_raw,
        description_raw,
        payment_method,
        receipt_status,
        review_status,
        duplicate_flag,
        matched_expense_id,
        excluded_flag
      `
      )
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "review行の更新に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      row: data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "update-status処理に失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}