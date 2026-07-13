import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LINE_SESSION_COOKIE = "customer_line_session";

type LineSessionPayload = {
  customer_id: string;
  line_user_id: string;
};

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  menu: string | null;
  menu_name: string | null;
  next_proposal: string | null;
  staff_name: string | null;
  created_at: string | null;
};

type ReservationRow = {
  id: string;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  status: string | null;
  start_at: string | null;
  end_at: string | null;
  source: string | null;
  created_at: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase環境変数が不足しています");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

function safeDecodeJson<T>(value: string | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = safeDecodeJson<LineSessionPayload>(
      request.cookies.get(LINE_SESSION_COOKIE)?.value
    );

    if (!session?.customer_id || !session.line_user_id) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          customer: null,
          error: "LINEログインが必要です",
        },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, name, line_login_id")
      .eq("id", session.customer_id)
      .eq("line_login_id", session.line_user_id)
      .maybeSingle();

    if (customerError || !customer) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          customer: null,
          error: "顧客情報を確認できません",
        },
        { status: 401 }
      );
    }

    const customerId = customer.id;

    const [
      visitsResult,
      reservationsResult,
      diagnosesResult,
      nailTipOrdersResult,
      staffsResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("visits")
        .select(
          "id, customer_id, visit_date, menu, menu_name, next_proposal, staff_name, created_at"
        )
        .eq("customer_id", customerId)
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("reservations")
        .select(
          "id, customer_id, staff_id, menu, status, start_at, end_at, source, created_at"
        )
        .eq("customer_id", customerId)
        .order("start_at", { ascending: false }),
      supabaseAdmin
        .from("sanmeigaku_diagnoses")
        .select(
          "id, lucky_color, lucky_stone, nail_theme, diagnosis_message, created_at"
        )
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("nail_tip_orders")
        .select(
          "id, lucky_color, lucky_stone, nail_theme, design_request, size_status, delivery_request, status, created_at"
        )
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("staffs").select("id, name"),
    ]);

    const firstError =
      visitsResult.error ||
      reservationsResult.error ||
      diagnosesResult.error ||
      nailTipOrdersResult.error ||
      staffsResult.error;

    if (firstError) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: true,
          customer: {
            id: customer.id,
            name: customer.name,
          },
          error: firstError.message,
        },
        { status: 500 }
      );
    }

    const visits = (visitsResult.data || []) as VisitRow[];
    const reservations = (reservationsResult.data || []) as ReservationRow[];
    const staffs = (staffsResult.data || []) as StaffRow[];

    const visitIds = visits.map((visit) => visit.id).filter(Boolean);

    let visitPhotos: Array<{
      id: string;
      visit_id: string | null;
      image_url: string | null;
      photo_type: string | null;
      created_at: string | null;
    }> = [];

    if (visitIds.length > 0) {
      const { data: photos, error: photosError } = await supabaseAdmin
        .from("visit_photos")
        .select("id, visit_id, image_url, photo_type, created_at")
        .in("visit_id", visitIds)
        .order("created_at", { ascending: true });

      if (photosError) {
        return NextResponse.json(
          {
            ok: false,
            authenticated: true,
            customer: {
              id: customer.id,
              name: customer.name,
            },
            error: photosError.message,
          },
          { status: 500 }
        );
      }

      visitPhotos = photos || [];
    }

    const staffMap = new Map(
      staffs.map((staff) => [staff.id, staff.name || "未設定"])
    );

    const safeReservations = reservations.map((reservation) => ({
      id: reservation.id,
      menu: reservation.menu,
      status: reservation.status,
      start_at: reservation.start_at,
      end_at: reservation.end_at,
      staff_name: reservation.staff_id
        ? staffMap.get(reservation.staff_id) || "未設定"
        : "指名なし",
      source: reservation.source,
      created_at: reservation.created_at,
    }));

    return NextResponse.json({
      ok: true,
      authenticated: true,
      customer: {
        id: customer.id,
        name: customer.name,
      },
      visits: visits.map((visit) => ({
        id: visit.id,
        visit_date: visit.visit_date,
        menu: visit.menu,
        menu_name: visit.menu_name,
        next_proposal: visit.next_proposal,
        staff_name: visit.staff_name,
        created_at: visit.created_at,
      })),
      visitPhotos,
      reservations: safeReservations,
      diagnoses: diagnosesResult.data || [],
      nailTipOrders: nailTipOrdersResult.data || [],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "顧客履歴の取得に失敗しました";

    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        customer: null,
        error: message,
      },
      { status: 500 }
    );
  }
}