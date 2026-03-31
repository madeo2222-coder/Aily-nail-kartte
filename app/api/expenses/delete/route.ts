import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Supabase環境変数が不足しています" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = await req.json();
    const expenseId = body?.expenseId as string | undefined;

    if (!expenseId) {
      return NextResponse.json(
        { error: "expenseId がありません" },
        { status: 400 }
      );
    }

    // 1. 先に expenses 本体を取得
    const { data: expenseRow, error: expenseFetchError } = await supabase
      .from("expenses")
      .select("id, source_import_row_id")
      .eq("id", expenseId)
      .single();

    if (expenseFetchError || !expenseRow) {
      return NextResponse.json(
        { error: `対象経費の取得に失敗しました: ${expenseFetchError?.message}` },
        { status: 500 }
      );
    }

    const restoreIds: string[] = [];

    // 2. 新方式: expenses.source_import_row_id から復元対象を拾う
    if (expenseRow.source_import_row_id) {
      restoreIds.push(expenseRow.source_import_row_id);
    }

    // 3. 旧方式フォールバック: matched_expense_id からも拾う
    const { data: matchedRows, error: matchedError } = await supabase
      .from("expense_import_rows")
      .select("id")
      .eq("matched_expense_id", expenseId);

    if (matchedError) {
      return NextResponse.json(
        { error: `紐づき確認に失敗しました: ${matchedError.message}` },
        { status: 500 }
      );
    }

    if (matchedRows && matchedRows.length > 0) {
      for (const row of matchedRows) {
        if (!restoreIds.includes(row.id)) {
          restoreIds.push(row.id);
        }
      }
    }

    // 4. expenses 削除
    const { error: deleteError } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId);

    if (deleteError) {
      return NextResponse.json(
        { error: `expenses削除に失敗しました: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // 5. review 側に戻す
    if (restoreIds.length > 0) {
      const { error: restoreError } = await supabase
        .from("expense_import_rows")
        .update({
          review_status: "unreviewed",
          matched_expense_id: null,
          excluded_flag: false,
        })
        .in("id", restoreIds);

      if (restoreError) {
        return NextResponse.json(
          {
            error: `expenses削除は完了しましたが、review復元に失敗しました: ${restoreError.message}`,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      restoredCount: restoreIds.length,
    });
  } catch (error) {
    console.error("expense delete API error:", error);

    return NextResponse.json(
      { error: "経費削除中にサーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}