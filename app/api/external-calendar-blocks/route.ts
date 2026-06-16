import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireStaffSession } from "@/lib/server/requireStaffSession";

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

function buildUtcIsoFromJst(dateText: string, timeText: string) {
  const date = new Date(`${dateText}T${timeText}:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export async function POST(req: NextRequest) {
  const authError = requireStaffSession(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    const salonId = String(body.salonId || "").trim() || null;
    const staffId = String(body.staffId || "").trim() || null;
    const source = String(body.source || "manual").trim();
    const title = String(body.title || "").trim() || null;
    const date = String(body.date || "").trim();
    const startTime = String(body.startTime || "").trim();
    const endTime = String(body.endTime || "").trim();
    const memo = String(body.memo || "").trim() || null;

    if (!staffId) {
      return NextResponse.json({ ok: false, error: "担当スタッフを選択してください" }, { status: 400 });
    }

    if (!date || !startTime || !endTime) {
      return NextResponse.json({ ok: false, error: "日付・開始時間・終了時間を入力してください" }, { status: 400 });
    }

    if (startTime < "10:00" || endTime > "19:00" || startTime >= endTime) {
      return NextResponse.json({ ok: false, error: "時間は10:00〜19:00の範囲で正しく入力してください" }, { status: 400 });
    }

    const startAt = buildUtcIsoFromJst(date, startTime);
    const endAt = buildUtcIsoFromJst(date, endTime);

    if (!startAt || !endAt) {
      return NextResponse.json({ ok: false, error: "日時の変換に失敗しました" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("external_calendar_blocks").insert({
      salon_id: salonId,
      staff_id: staffId,
      source,
      title,
      start_at: startAt,
      end_at: endAt,
      memo,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "外部予約ブロック登録に失敗しました",
      },
      { status: 500 }
    );
  }
}