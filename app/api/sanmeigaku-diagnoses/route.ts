import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const salonId = String(body.salonId || "").trim();
    const customerId = String(body.customerId || "").trim();

    const name = String(body.name || "").trim();
    const birthday = String(body.birthday || "").trim();

    const fortune = String(body.fortune || "").trim();
    const mood = String(body.mood || "").trim();

    const luckyColor = String(body.luckyColor || "").trim();
    const luckyStone = String(body.luckyStone || "").trim();
    const nailTheme = String(body.nailTheme || "").trim();
    const message = String(body.message || "").trim();

    const diagnosisType = String(
      body.diagnosisType || "free_nail"
    ).trim();

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          error: "名前が未入力です",
        },
        { status: 400 }
      );
    }

    if (!birthday) {
      return NextResponse.json(
        {
          ok: false,
          error: "生年月日が未入力です",
        },
        { status: 400 }
      );
    }

    const insertData: {
      salon_id?: string;
      customer_id?: string;
      name: string;
      birthday: string;
      fortune: string;
      mood: string;
      lucky_color: string;
      lucky_stone: string;
      nail_theme: string;
      diagnosis_message: string;
      diagnosis_type: string;
    } = {
      name,
      birthday,
      fortune,
      mood,
      lucky_color: luckyColor,
      lucky_stone: luckyStone,
      nail_theme: nailTheme,
      diagnosis_message: message,
      diagnosis_type: diagnosisType,
    };

    if (salonId) {
      insertData.salon_id = salonId;
    }

    if (customerId) {
      insertData.customer_id = customerId;
    }

    const { data, error } = await supabase
      .from("sanmeigaku_diagnoses")
      .insert(insertData)
      .select("id")
      .single();

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
      diagnosisId: data.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "診断保存に失敗しました";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}