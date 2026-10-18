import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, requireCustomerLineSession } from "@/lib/server/requireCustomerLineSession";

export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomerLineSession(request);
    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "診断履歴の保存にはLINEログインが必要です" },
        { status: 401 }
      );
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "診断内容を確認してください" }, { status: 400 });
    }
    const values = body as Record<string, unknown>;
    const limits: Record<string, number> = {
      name: 100, birthday: 10, fortune: 100, mood: 100,
      luckyColor: 100, luckyStone: 100, nailTheme: 200, message: 4000,
    };
    const fields: Record<string, string> = {};
    for (const [key, limit] of Object.entries(limits)) {
      const value = values[key] ?? "";
      if (typeof value !== "string" || value.length > limit) {
        return NextResponse.json({ ok: false, error: "診断内容を確認してください" }, { status: 400 });
      }
      fields[key] = value.trim();
    }
    const birthday = new Date(`${fields.birthday}T00:00:00+09:00`);
    if (!fields.name || !/^\d{4}-\d{2}-\d{2}$/.test(fields.birthday) ||
        !Number.isFinite(birthday.getTime()) || birthday.getTime() > Date.now() ||
        new Date(birthday.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) !== fields.birthday ||
        (values.diagnosisType !== undefined && values.diagnosisType !== "free_nail")) {
      return NextResponse.json({ ok: false, error: "お名前・生年月日・診断内容を確認してください" }, { status: 400 });
    }
    // Identity comes only from the verified LINE session, never the request body.
    const { data, error } = await getSupabaseAdmin()
      .from("sanmeigaku_diagnoses")
      .insert({
        customer_id: customer.id,
        salon_id: customer.salonId,
        name: fields.name,
        birthday: fields.birthday,
        fortune: fields.fortune,
        mood: fields.mood,
        lucky_color: fields.luckyColor,
        lucky_stone: fields.luckyStone,
        nail_theme: fields.nailTheme,
        diagnosis_message: fields.message,
        diagnosis_type: "free_nail",
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      return NextResponse.json({ ok: false, error: "診断履歴を保存できませんでした" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, diagnosisId: data.id });
  } catch {
    return NextResponse.json({ ok: false, error: "診断履歴を保存できませんでした" }, { status: 500 });
  }
}
