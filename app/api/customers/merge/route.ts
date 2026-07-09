import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      keepCustomerId?: string;
      mergeCustomerId?: string;
    };

    const keepCustomerId = body.keepCustomerId?.trim();
    const mergeCustomerId = body.mergeCustomerId?.trim();

    if (!keepCustomerId || !mergeCustomerId) {
      return NextResponse.json(
        { ok: false, error: "残す顧客IDと統合する顧客IDを入力してください" },
        { status: 400 }
      );
    }

    if (keepCustomerId === mergeCustomerId) {
      return NextResponse.json(
        { ok: false, error: "同じ顧客IDは統合できません" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: keepCustomer, error: keepError } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone, notes")
      .eq("id", keepCustomerId)
      .maybeSingle();

    if (keepError) throw new Error(keepError.message);

    if (!keepCustomer) {
      return NextResponse.json(
        { ok: false, error: "残す顧客が見つかりません" },
        { status: 404 }
      );
    }

    const { data: mergeCustomer, error: mergeError } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone, notes")
      .eq("id", mergeCustomerId)
      .maybeSingle();

    if (mergeError) throw new Error(mergeError.message);

    if (!mergeCustomer) {
      return NextResponse.json(
        { ok: false, error: "統合する顧客が見つかりません" },
        { status: 404 }
      );
    }

    const moved: Record<string, number> = {};

    async function moveCustomerId(tableName: string) {
      const { count, error } = await supabaseAdmin
        .from(tableName)
        .update({ customer_id: keepCustomerId }, { count: "exact" })
        .eq("customer_id", mergeCustomerId);

      if (error) {
        console.error(`${tableName} 統合エラー:`, error.message);
        moved[tableName] = -1;
        return;
      }

      moved[tableName] = count || 0;
    }

    await moveCustomerId("reservations");
    await moveCustomerId("visits");
    await moveCustomerId("sales");
    await moveCustomerId("coupon_histories");
    await moveCustomerId("line_notification_logs");

    const nextNotes = [
      typeof keepCustomer.notes === "string" ? keepCustomer.notes : "",
      "",
      "【顧客統合履歴】",
      `統合日時：${new Date().toISOString()}`,
      `統合元ID：${mergeCustomerId}`,
      `統合元氏名：${mergeCustomer.name || ""}`,
      `統合元電話：${mergeCustomer.phone || ""}`,
      typeof mergeCustomer.notes === "string" && mergeCustomer.notes.trim()
        ? `統合元メモ：${mergeCustomer.notes}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { error: updateKeepError } = await supabaseAdmin
      .from("customers")
      .update({
        notes: nextNotes,
        phone: keepCustomer.phone || mergeCustomer.phone || null,
      })
      .eq("id", keepCustomerId);

    if (updateKeepError) throw new Error(updateKeepError.message);

    const { error: deleteError } = await supabaseAdmin
      .from("customers")
      .delete()
      .eq("id", mergeCustomerId);

    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({
      ok: true,
      keepCustomerId,
      mergeCustomerId,
      keepCustomerName: keepCustomer.name,
      mergeCustomerName: mergeCustomer.name,
      moved,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "顧客統合に失敗しました",
      },
      { status: 500 }
    );
  }
}