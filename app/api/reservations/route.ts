import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const menu = String(body.menu || "").trim();
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const memo = String(body.memo || "").trim();

    if (!menu) {
      return NextResponse.json(
        { ok: false, error: "メニューが未入力です" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { ok: false, error: "希望日が未入力です" },
        { status: 400 }
      );
    }

    if (!time) {
      return NextResponse.json(
        { ok: false, error: "希望時間が未入力です" },
        { status: 400 }
      );
    }

    const startAt = new Date(`${date}T${time}:00+09:00`);
    const endAt = new Date(startAt.getTime() + 90 * 60 * 1000);

    const { data, error } = await supabase
      .from("reservations")
      .insert({
        menu,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        status: "requested",
        memo,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reservationId: data.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "予約保存に失敗しました";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}