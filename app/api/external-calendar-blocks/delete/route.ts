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
      { ok: false, error: "この予定を削除する権限がありません" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "IDがありません" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: block, error: blockError } = await supabase
      .from("external_calendar_blocks")
      .select("id, salon_id, staff_id")
      .eq("id", id)
      .maybeSingle();

    if (blockError) {
      return NextResponse.json(
        { ok: false, error: "予定情報の確認に失敗しました" },
        { status: 500 }
      );
    }

    if (!block) {
      return NextResponse.json(
        { ok: false, error: "予定が見つかりません" },
        { status: 404 }
      );
    }

    const belongsToSalon = block.salon_id === authentication.principal.salonId;

    if (!belongsToSalon && !block.salon_id && block.staff_id) {
      const { data: staff, error: staffError } = await supabase
        .from("staffs")
        .select("id")
        .eq("id", block.staff_id)
        .eq("salon_id", authentication.principal.salonId)
        .maybeSingle();

      if (staffError) {
        return NextResponse.json(
          { ok: false, error: "スタッフ情報の確認に失敗しました" },
          { status: 500 }
        );
      }

      if (!staff) {
        return NextResponse.json(
          { ok: false, error: "この予定を削除する権限がありません" },
          { status: 403 }
        );
      }
    } else if (!belongsToSalon) {
      return NextResponse.json(
        { ok: false, error: "この予定を削除する権限がありません" },
        { status: 403 }
      );
    }

    let deleteQuery = supabase
      .from("external_calendar_blocks")
      .delete()
      .eq("id", id);

    deleteQuery = block.salon_id
      ? deleteQuery.eq("salon_id", block.salon_id)
      : deleteQuery.is("salon_id", null);

    const { error } = await deleteQuery;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "削除に失敗しました",
      },
      { status: 500 }
    );
  }
}
