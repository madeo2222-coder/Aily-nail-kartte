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
    const importId = body?.importId as string | undefined;

    if (!importId) {
      return NextResponse.json(
        { error: "importId がありません" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("expense_imports")
      .delete()
      .eq("id", importId);

    if (error) {
      return NextResponse.json(
        { error: error.message || "CSV取込データの削除に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("delete import error:", error);

    return NextResponse.json(
      { error: "CSV取込削除中にサーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}