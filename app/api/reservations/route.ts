import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const menu = String(body.menu || "").trim();
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const memo = String(body.memo || "").trim();
    const staffId = String(body.staffId || "").trim();

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
    const startIso = startAt.toISOString();
    const endIso = endAt.toISOString();

    let overlapQuery = supabase
      .from("reservations")
      .select("id, status, staff_id, start_at, end_at")
      .neq("status", "キャンセル")
      .lt("start_at", endIso)
      .gt("end_at", startIso);

    if (staffId) {
      overlapQuery = overlapQuery.eq("staff_id", staffId);
    }

    const { data: overlapReservations, error: overlapError } =
      await overlapQuery;

    if (overlapError) {
      return NextResponse.json(
        { ok: false, error: overlapError.message },
        { status: 500 }
      );
    }

    if (overlapReservations && overlapReservations.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: staffId
            ? "選択した担当者はその時間帯に既に予約があります"
            : "その時間帯は既に予約があります",
        },
        { status: 400 }
      );
    }

    const insertData: {
      menu: string;
      start_at: string;
      end_at: string;
      status: string;
      memo: string;
      staff_id?: string;
    } = {
      menu,
      start_at: startIso,
      end_at: endIso,
      status: "requested",
      memo,
    };

    if (staffId) {
      insertData.staff_id = staffId;
    }

    const { data, error } = await supabase
      .from("reservations")
      .insert(insertData)
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