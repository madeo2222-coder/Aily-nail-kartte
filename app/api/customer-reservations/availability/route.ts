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
    const reservationId =
      typeof body.reservationId === "string"
        ? body.reservationId.trim()
        : "";
    const durationMinutes = normalizeCustomerBookingDuration(
      body.durationMinutes
    );

    if (!isValidCustomerBookingDate(date) || durationMinutes === null) {
      return NextResponse.json(
        { ok: false, error: "日付または所要時間を確認してください" },
        { status: 400 }
      );
    }

    if (reservationId && reservationId.length > 100) {
      return NextResponse.json(
        { ok: false, error: "予約内容を確認してください" },
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

    if (reservationId) {
      const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .select("id")
        .eq("id", reservationId)
        .eq("customer_id", customer.id)
        .eq("salon_id", salonId)
        .maybeSingle();

      if (reservationError) {
        throw new Error("Reservation ownership lookup failed.");
      }

      if (!reservation) {
        return NextResponse.json(
          { ok: false, error: "予約内容を確認できません" },
          { status: 404 }
        );
      }
    }

    const availability = await getCustomerReservationAvailability({
      supabase,
      salonId,
      date,
      durationMinutes,
      excludeReservationId: reservationId || undefined,
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
