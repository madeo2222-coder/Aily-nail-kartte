import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LINE_SESSION_COOKIE = "customer_line_session";

type LineSessionPayload = {
  customer_id: string;
  line_user_id: string;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase環境変数が不足しています");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

function safeDecodeJson<T>(value: string | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = safeDecodeJson<LineSessionPayload>(
      request.cookies.get(LINE_SESSION_COOKIE)?.value
    );

    if (!session?.customer_id || !session.line_user_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "LINEログインが必要です",
        },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, salon_id, line_login_id")
      .eq("id", session.customer_id)
      .eq("line_login_id", session.line_user_id)
      .maybeSingle();

    if (customerError || !customer) {
      return NextResponse.json(
        {
          ok: false,
          error: "顧客情報を確認できません",
        },
        { status: 401 }
      );
    }

    let query = supabaseAdmin
      .from("staffs")
      .select("id, name")
      .order("name", { ascending: true });

    if (customer.salon_id) {
      query = query.eq("salon_id", customer.salon_id);
    }

    const { data: staffs, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      staffs: staffs || [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "スタッフ取得に失敗しました";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}