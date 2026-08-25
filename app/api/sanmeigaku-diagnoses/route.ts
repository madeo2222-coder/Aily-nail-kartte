import { NextRequest, NextResponse } from "next/server";
import {
  calculateFixedDiagnosis,
  DiagnosisValidationError,
  parseFixedDiagnosisInput,
} from "@/lib/sanmeigaku/calculate";
import { requireCustomerLineSession, getSupabaseAdmin } from "@/lib/server/requireCustomerLineSession";

export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomerLineSession(request);

    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "LINEログインが必要です" },
        { status: 401 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "入力内容を確認してください" },
        { status: 400 }
      );
    }

    const input = parseFixedDiagnosisInput(body);
    const diagnosis = calculateFixedDiagnosis(input);
    const recommendation = diagnosis.result.recommendation;
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("sanmeigaku_diagnoses")
      .insert({
        salon_id: customer.salonId,
        customer_id: customer.id,
        name: input.name,
        birthday: input.birthDate,
        gender: input.gender,
        fortune: input.requestedFortune,
        mood: input.preferredMood,
        lucky_color: recommendation.luckyColor,
        lucky_stone: recommendation.luckyStone,
        nail_theme: recommendation.nailTheme,
        message: recommendation.message,
        diagnosis_type: "fixed_nail_mvp",
        calculation_version: diagnosis.result.calculationVersion,
        calculation_result: diagnosis.result,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("sanmeigaku diagnosis insert failed", error?.code);
      return NextResponse.json(
        { ok: false, error: "診断結果の保存に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      diagnosisId: data.id,
    });
  } catch (error) {
    if (error instanceof DiagnosisValidationError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    console.error(
      "sanmeigaku diagnosis creation failed",
      error instanceof Error ? error.name : "UnknownError"
    );

    return NextResponse.json(
      { ok: false, error: "診断処理に失敗しました" },
      { status: 500 }
    );
  }
}
