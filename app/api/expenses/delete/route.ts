import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function maskValue(value: string | undefined) {
  if (!value) return null;
  if (value.length <= 12) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        {
          error: "Supabase環境変数が不足しています",
          debug: {
            hasUrl: !!supabaseUrl,
            hasServiceRoleKey: !!supabaseServiceRoleKey,
            urlPreview: supabaseUrl ?? null,
            serviceRolePreview: maskValue(supabaseServiceRoleKey),
          },
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const expenseId = body?.expenseId as string | undefined;

    if (!expenseId) {
      return NextResponse.json(
        { error: "expenseId がありません" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // まず接続テスト
    const { error: healthError } = await supabase
      .from("expenses")
      .select("id")
      .limit(1);

    if (healthError) {
      return NextResponse.json(
        {
          error: `Supabase接続テストに失敗しました: ${healthError.message}`,
          debug: {
            urlPreview: supabaseUrl,
            serviceRolePreview: maskValue(supabaseServiceRoleKey),
            serviceRoleLength: supabaseServiceRoleKey.length,
          },
        },
        { status: 500 }
      );
    }

    // 1. expenses 本体取得
    const { data: expenseRow, error: expenseFetchError } = await supabase
      .from("expenses")
      .select("id, source_import_row_id")
      .eq("id", expenseId)
      .single();

    if (expenseFetchError || !expenseRow) {
      return NextResponse.json(
        {
          error: `対象経費の取得に失敗しました: ${
            expenseFetchError?.message ?? "not found"
          }`,
          debug: {
            urlPreview: supabaseUrl,
            serviceRolePreview: maskValue(supabaseServiceRoleKey),
            serviceRoleLength: supabaseServiceRoleKey.length,
          },
        },
        { status: 500 }
      );
    }

    const restoreIds: string[] = [];

    if (expenseRow.source_import_row_id) {
      restoreIds.push(expenseRow.source_import_row_id);
    }

    // 2. 旧方式フォールバック
    const { data: matchedRows, error: matchedError } = await supabase
      .from("expense_import_rows")
      .select("id")
      .eq("matched_expense_id", expenseId);

    if (matchedError) {
      return NextResponse.json(
        {
          error: `紐づき確認に失敗しました: ${matchedError.message}`,
          debug: {
            urlPreview: supabaseUrl,
            serviceRolePreview: maskValue(supabaseServiceRoleKey),
            serviceRoleLength: supabaseServiceRoleKey.length,
          },
        },
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

    // 3. expenses 削除
    const { error: deleteError } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId);

    if (deleteError) {
      return NextResponse.json(
        {
          error: `expenses削除に失敗しました: ${deleteError.message}`,
          debug: {
            urlPreview: supabaseUrl,
            serviceRolePreview: maskValue(supabaseServiceRoleKey),
            serviceRoleLength: supabaseServiceRoleKey.length,
          },
        },
        { status: 500 }
      );
    }

    // 4. review 戻し
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
            debug: {
              urlPreview: supabaseUrl,
              serviceRolePreview: maskValue(supabaseServiceRoleKey),
              serviceRoleLength: supabaseServiceRoleKey.length,
            },
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
      {
        error: "経費削除中にサーバーエラーが発生しました",
        debug:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : null,
      },
      { status: 500 }
    );
  }
  console.log("KEY LENGTH:", process.env.SUPABASE_SERVICE_ROLE_KEY?.length);
}