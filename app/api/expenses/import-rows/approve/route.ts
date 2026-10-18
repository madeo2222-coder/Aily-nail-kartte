import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireStaffSession } from "@/lib/server/requireStaffSession";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase環境変数が不足しています");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function guessCategory(text: string) {
  if (text.includes("交通") || text.includes("タクシー") || text.includes("JR")) {
    return "旅費交通費";
  }

  if (text.includes("広告") || text.includes("Google") || text.includes("META")) {
    return "広告宣伝費";
  }

  if (text.includes("通信") || text.includes("携帯") || text.includes("NTT")) {
    return "通信費";
  }

  return "雑費";
}

export async function POST(req: NextRequest) {
  const authError = await requireStaffSession(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const rowId = String(body.rowId || "").trim();

    if (!rowId) {
      return NextResponse.json({ error: "rowId がありません" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: row, error: rowError } = await supabase
      .from("expense_import_rows")
      .select(
        "id, expense_date, amount, vendor_raw, description_raw, review_status, matched_expense_id, excluded_flag"
      )
      .eq("id", rowId)
      .single();

    if (rowError || !row) {
      return NextResponse.json(
        { error: rowError?.message || "取込候補が見つかりません" },
        { status: 404 }
      );
    }

    if (row.excluded_flag === true) {
      return NextResponse.json(
        { error: "除外済みの取込候補は正式登録できません" },
        { status: 409 }
      );
    }

    if (row.matched_expense_id) {
      const { data: existingExpense, error: existingExpenseError } =
        await supabase
          .from("expenses")
          .select("id")
          .eq("id", row.matched_expense_id)
          .maybeSingle();

      if (existingExpenseError) {
        return NextResponse.json(
          { error: `登録済み経費の確認に失敗しました: ${existingExpenseError.message}` },
          { status: 500 }
        );
      }

      if (!existingExpense) {
        return NextResponse.json(
          {
            error:
              "取込候補の登録状態が不整合です。経費一覧を確認してから再試行してください",
          },
          { status: 409 }
        );
      }

      if (row.review_status !== "confirmed") {
        const { error: repairError } = await supabase
          .from("expense_import_rows")
          .update({ review_status: "confirmed" })
          .eq("id", rowId);

        if (repairError) {
          return NextResponse.json(
            { error: `取込候補の状態補正に失敗しました: ${repairError.message}` },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        ok: true,
        expenseId: existingExpense.id,
        alreadyApproved: true,
      });
    }

    if (row.review_status === "confirmed") {
      return NextResponse.json(
        {
          error:
            "確定済みの取込候補に経費の紐づきがありません。経費一覧を確認してください",
        },
        { status: 409 }
      );
    }

    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "取込候補の金額が不正です" },
        { status: 400 }
      );
    }

    if (
      typeof row.expense_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.expense_date)
    ) {
      return NextResponse.json(
        { error: "取込候補の日付が不正です" },
        { status: 400 }
      );
    }

    const text = `${row.vendor_raw || ""} ${row.description_raw || ""}`.trim();

    const { data: insertedExpense, error: insertError } = await supabase
      .from("expenses")
      .insert({
        expense_date: row.expense_date,
        category: guessCategory(text),
        amount: Math.round(amount),
        memo: text || null,
        receipt_url: null,
        source_import_row_id: row.id,
      })
      .select("id")
      .single();

    if (insertError || !insertedExpense) {
      return NextResponse.json(
        { error: insertError?.message || "経費登録に失敗しました" },
        { status: 500 }
      );
    }

    let updateError: { message?: string } | null = null;
    let updatedRow: { id: string } | null = null;
    let updateOutcomeUnknown = false;

    try {
      const result = await supabase
        .from("expense_import_rows")
        .update({
          review_status: "confirmed",
          excluded_flag: false,
          matched_expense_id: insertedExpense.id,
        })
        .eq("id", rowId)
        .eq("excluded_flag", false)
        .is("matched_expense_id", null)
        .select("id")
        .maybeSingle();

      updateError = result.error;
      updatedRow = result.data;
    } catch (error) {
      updateOutcomeUnknown = true;
      updateError = {
        message: error instanceof Error ? error.message : "取込候補の更新に失敗しました",
      };
    }

    if (updateError || !updatedRow) {
      if (updateOutcomeUnknown) {
        try {
          const { data: reconciledRow, error: reconciliationError } =
            await supabase
              .from("expense_import_rows")
              .select("matched_expense_id, review_status")
              .eq("id", rowId)
              .maybeSingle();

          if (reconciliationError) {
            return NextResponse.json(
              {
                error:
                  "経費登録後の取込候補更新結果を確認できません。経費一覧の確認が必要です",
                expenseId: insertedExpense.id,
                repairRequired: true,
              },
              { status: 500 }
            );
          }

          if (reconciledRow?.matched_expense_id === insertedExpense.id) {
            return NextResponse.json({
              ok: true,
              expenseId: insertedExpense.id,
              reconciledAfterNetworkError: true,
            });
          }
        } catch {
          return NextResponse.json(
            {
              error:
                "経費登録後の取込候補更新結果を確認できません。経費一覧の確認が必要です",
              expenseId: insertedExpense.id,
              repairRequired: true,
            },
            { status: 500 }
          );
        }
      }

      let rollbackError: { message?: string } | null = null;

      try {
        const rollbackResult = await supabase
          .from("expenses")
          .delete()
          .eq("id", insertedExpense.id);
        rollbackError = rollbackResult.error;
      } catch (error) {
        rollbackError = {
          message: error instanceof Error ? error.message : "補償削除に失敗しました",
        };
      }

      if (rollbackError) {
        return NextResponse.json(
          {
            error:
              "経費登録後の取込候補更新と補償削除に失敗しました。経費一覧の確認が必要です",
            expenseId: insertedExpense.id,
            repairRequired: true,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: `取込候補の更新に失敗したため経費登録を取り消しました: ${
            updateError?.message ?? "別の処理で状態が更新されました"
          }`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, expenseId: insertedExpense.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "正式登録に失敗しました",
      },
      { status: 500 }
    );
  }
}
