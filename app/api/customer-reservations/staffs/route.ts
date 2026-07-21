import { NextRequest, NextResponse } from "next/server";
import { resolveCustomerBookingSalonId } from "@/lib/server/customerReservationAvailability";
import {
  getSupabaseAdmin,
  requireCustomerLineSession,
} from "@/lib/server/requireCustomerLineSession";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomerLineSession(request);

    if (!customer) {
      return NextResponse.json(
        {
          ok: false,
          error: "LINEログインが必要です",
        },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const salonId = await resolveCustomerBookingSalonId(
      supabaseAdmin,
      customer.salonId
    );

    if (!salonId) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約店舗を確認できません",
        },
        { status: 400 }
      );
    }

    const { data: staffs, error } = await supabaseAdmin
      .from("staffs")
      .select("id, name")
      .eq("salon_id", salonId)
      .eq("customer_booking_enabled", true)
      .order("name", { ascending: true });

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
