import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

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

function buildLocalTimestamp(dateText: string, timeText: string) {
  if (!dateText || !timeText) {
    return null;
  }

  return `${dateText} ${timeText}:00`;
}

export async function POST(req: NextRequest) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: false,
    salonContextRequired: true,
  });

  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, error: authentication.error },
      { status: authentication.status }
    );
  }

  if (authentication.principal.authenticationMode !== "supabase") {
    return NextResponse.json(
      { ok: false, error: "この予定を登録する権限がありません" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    const staffId = String(body.staffId || "").trim() || null;
    const source = String(body.source || "manual").trim();
    const title = String(body.title || "").trim() || null;
    const date = String(body.date || "").trim();
    const startTime = String(body.startTime || "").trim();
    const endTime = String(body.endTime || "").trim();
    const memo = String(body.memo || "").trim() || null;

    if (!staffId) {
      return NextResponse.json(
        { ok: false, error: "担当スタッフを選択してください" },
        { status: 400 }
      );
    }

    if (!date || !startTime || !endTime) {
      return NextResponse.json(
        { ok: false, error: "日付・開始時間・終了時間を入力してください" },
        { status: 400 }
      );
    }

    if (startTime < "10:00" || endTime > "19:00" || startTime >= endTime) {
      return NextResponse.json(
        {
          ok: false,
          error: "時間は10:00〜19:00の範囲で正しく入力してください",
        },
        { status: 400 }
      );
    }

    const startAt = buildLocalTimestamp(date, startTime);
    const endAt = buildLocalTimestamp(date, endTime);

    if (!startAt || !endAt) {
      return NextResponse.json(
        { ok: false, error: "日時の変換に失敗しました" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: staff, error: staffError } = await supabase
      .from("staffs")
      .select("id")
      .eq("id", staffId)
      .eq("salon_id", authentication.principal.salonId)
      .eq("is_active", true)
      .maybeSingle();

    if (staffError) {
      return NextResponse.json(
        { ok: false, error: "スタッフ情報の確認に失敗しました" },
        { status: 500 }
      );
    }

    if (!staff) {
      return NextResponse.json(
        { ok: false, error: "このスタッフの予定を登録する権限がありません" },
        { status: 403 }
      );
    }

    const { error } = await supabase.from("external_calendar_blocks").insert({
      salon_id: authentication.principal.salonId,
      staff_id: staffId,
      source,
      title,
      start_at: startAt,
      end_at: endAt,
      memo,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "外部予約ブロック登録に失敗しました",
      },
      { status: 500 }
    );
  }
}
