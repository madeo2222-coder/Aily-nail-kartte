import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireStaffSession } from "@/lib/server/requireStaffSession";

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
  const authError = requireStaffSession(req);
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
      .select("*")
      .eq("id", rowId)
      .single();

    if (rowError || !row) {
      return NextResponse.json(
        { error: rowError?.message || "取込候補が見つかりません" },
        { status: 404 }
      );
    }

    const text = `${row.vendor_raw || ""} ${row.description_raw || ""}`;

    const { error: insertError } = await supabase.from("expenses").insert({
      expense_date: row.expense_date,
      category: guessCategory(text),
      amount: row.amount,
      memo: text.trim() || null,
      receipt_url: null,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from("expense_import_rows")
      .update({
        review_status: "approved",
        excluded_flag: true,
      })
      .eq("id", rowId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
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