import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerReservationAvailability,
  isValidCustomerBookingDate,
  normalizeCustomerBookingDuration,
  resolveCustomerBookingSalonId,
} from "@/lib/server/customerReservationAvailability";
import {
  getSupabaseAdmin,
  requireCustomerLineSession,
} from "@/lib/server/requireCustomerLineSession";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomerLineSession(request);
    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "LINEログインが必要です" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const durationMinutes = normalizeCustomerBookingDuration(
      body.durationMinutes
    );

    if (!isValidCustomerBookingDate(date) || durationMinutes === null) {
      return NextResponse.json(
        { ok: false, error: "日付または所要時間を確認してください" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const salonId = await resolveCustomerBookingSalonId(
      supabase,
      customer.salonId
    );

    if (!salonId) {
      return NextResponse.json(
        { ok: false, error: "予約店舗を確認できません" },
        { status: 400 }
      );
    }

    const availability = await getCustomerReservationAvailability({
      supabase,
      salonId,
      date,
      durationMinutes,
    });

    return NextResponse.json({ ok: true, ...availability });
  } catch (error) {
    console.error(
      "customer reservation availability failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { ok: false, error: "空き時間の取得に失敗しました" },
      { status: 500 }
    );
  }
}
