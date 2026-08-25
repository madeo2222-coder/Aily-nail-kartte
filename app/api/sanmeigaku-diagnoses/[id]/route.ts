import { NextRequest, NextResponse } from "next/server";
import type { DiagnosisApiResult, Gender } from "@/lib/sanmeigaku/types";
import { requireCustomerLineSession, getSupabaseAdmin } from "@/lib/server/requireCustomerLineSession";

type DiagnosisRow = {
  id: string;
  name: string | null;
  birthday: string | null;
  gender: Gender | null;
  fortune: string | null;
  mood: string | null;
  calculation_version: string | null;
  lucky_color: string | null;
  lucky_stone: string | null;
  nail_theme: string | null;
  message: string | null;
  created_at: string | null;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await requireCustomerLineSession(request);

    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "LINEログインが必要です" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!id || id.length > 100) {
      return NextResponse.json(
        { ok: false, error: "診断結果が見つかりません" },
        { status: 404 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("sanmeigaku_diagnoses")
      .select(
        "id, name, birthday, gender, fortune, mood, calculation_version, lucky_color, lucky_stone, nail_theme, message, created_at"
      )
      .eq("id", id)
      .eq("customer_id", customer.id)
      .maybeSingle();

    if (error) {
      console.error("sanmeigaku diagnosis lookup failed", error.code);
      return NextResponse.json(
        { ok: false, error: "診断結果の取得に失敗しました" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "診断結果が見つかりません" },
        { status: 404 }
      );
    }

    const row = data as DiagnosisRow;
    const diagnosis: DiagnosisApiResult = {
      id: row.id,
      name: row.name || "お客様",
      birthDate: row.birthday || "",
      gender: row.gender,
      requestedFortune: (row.fortune || "全体運") as DiagnosisApiResult["requestedFortune"],
      preferredMood: (row.mood || "ナチュラル") as DiagnosisApiResult["preferredMood"],
      calculationVersion: row.calculation_version || "legacy",
      luckyColor: row.lucky_color || "未登録",
      luckyStone: row.lucky_stone || "未登録",
      nailTheme: row.nail_theme || "未登録",
      message: row.message || "保存済みの診断メッセージはありません。",
      createdAt: row.created_at,
    };

    return NextResponse.json({ ok: true, diagnosis });
  } catch (error) {
    console.error(
      "sanmeigaku diagnosis retrieval failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { ok: false, error: "診断結果の取得に失敗しました" },
      { status: 500 }
    );
  }
}
