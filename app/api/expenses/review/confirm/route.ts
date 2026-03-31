import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CATEGORY_OPTIONS = [
  "材料費",
  "消耗品費",
  "旅費交通費",
  "通信費",
  "広告宣伝費",
  "医療費",
  "外注費",
  "福利厚生費",
  "雑費",
] as const;

type ExpenseCategory = (typeof CATEGORY_OPTIONS)[number];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toUpperCase().replace(/\s+/g, "");
}

function guessCategoryFromText(textRaw: string): ExpenseCategory {
  const text = normalizeText(textRaw);

  const includesAny = (keywords: string[]) =>
    keywords.some((keyword) => text.includes(keyword));

  if (
    includesAny([
      "ネイルタウン",
      "ネイル工房",
      "ネイルワールド",
      "グルービーネイル",
      "SHEIN",
      "TEMU",
      "ALIBABA",
    ])
  ) {
    return "材料費";
  }

  if (includesAny(["ツルハ", "セブン", "ローソン", "業務スーパー"])) {
    return "消耗品費";
  }

  if (
    includesAny([
      "ETC",
      "地下鉄",
      "GO",
      "Dパーキング",
      "Ｄパーキング",
      "AIRBNB",
      "KIWI",
      "TRIP",
      "航空",
    ])
  ) {
    return "旅費交通費";
  }

  if (includesAny(["ソフトバンク", "APPLECOMBILL", "APPLE COM BILL"])) {
    return "通信費";
  }

  if (includesAny(["病院", "予防医学", "センター"])) {
    return "医療費";
  }

  return "雑費";
}

function isValidCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    CATEGORY_OPTIONS.includes(value as ExpenseCategory)
  );
}

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isValidExpenseDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase環境変数が不足しています。" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const rowId = body?.rowId;
    const requestedCategory = body?.category;

    if (!isValidUuid(rowId)) {
      return NextResponse.json(
        { error: "rowId形式が不正です。" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: row, error: rowError } = await supabase
      .from("expense_import_rows")
      .select(
        `
          id,
          expense_date,
          amount,
          vendor_raw,
          description_raw,
          review_status,
          matched_expense_id,
          excluded_flag
        `
      )
      .eq("id", rowId)
      .single();

    if (rowError || !row) {
      return NextResponse.json(
        { error: rowError?.message || "対象のreview行が見つかりません。" },
        { status: 404 }
      );
    }

    if (row.excluded_flag === true) {
      return NextResponse.json(
        { error: "除外済みデータは確定できません。" },
        { status: 400 }
      );
    }

    if (!isValidExpenseDate(row.expense_date)) {
      return NextResponse.json(
        { error: "expense_date が不正です。" },
        { status: 400 }
      );
    }

    const amount = toNumber(row.amount);
    if (amount === null) {
      return NextResponse.json(
        { error: "amount が不正です。" },
        { status: 400 }
      );
    }

    const fallbackCategory = guessCategoryFromText(
      `${row.vendor_raw ?? ""} ${row.description_raw ?? ""}`
    );

    const finalCategory: ExpenseCategory = isValidCategory(requestedCategory)
      ? requestedCategory
      : fallbackCategory;

    const memo = [row.vendor_raw, row.description_raw]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(" / ");

    // すでにexpenseに紐づいている場合は、まずそのexpense実在確認
    if (isValidUuid(row.matched_expense_id)) {
      const { data: existingExpense, error: existingExpenseError } =
        await supabase
          .from("expenses")
          .select("id, expense_date, category, amount, memo, source_import_row_id")
          .eq("id", row.matched_expense_id)
          .maybeSingle();

      if (existingExpenseError) {
        return NextResponse.json(
          { error: existingExpenseError.message || "既存経費の確認に失敗しました。" },
          { status: 500 }
        );
      }

      if (existingExpense) {
        if (row.review_status !== "confirmed") {
          const { error: repairError } = await supabase
            .from("expense_import_rows")
            .update({
              review_status: "confirmed",
            })
            .eq("id", row.id);

          if (repairError) {
            return NextResponse.json(
              { error: repairError.message || "review状態の補正に失敗しました。" },
              { status: 500 }
            );
          }
        }

        return NextResponse.json({
          ok: true,
          expense: existingExpense,
          alreadyConfirmed: true,
        });
      }
    }

    const { data: expense, error: insertError } = await supabase
      .from("expenses")
      .insert({
        expense_date: row.expense_date,
        category: finalCategory,
        amount,
        memo,
        source_import_row_id: row.id,
      })
      .select("id, expense_date, category, amount, memo, source_import_row_id")
      .single();

    if (insertError || !expense) {
      return NextResponse.json(
        { error: insertError?.message || "expenses登録に失敗しました。" },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("expense_import_rows")
      .update({
        review_status: "confirmed",
        matched_expense_id: expense.id,
      })
      .eq("id", row.id);

    if (updateError) {
      await supabase.from("expenses").delete().eq("id", expense.id);

      return NextResponse.json(
        { error: updateError.message || "review更新に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      expense,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "confirm処理に失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}