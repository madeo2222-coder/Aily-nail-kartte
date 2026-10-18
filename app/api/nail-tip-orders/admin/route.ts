import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createClient(url, key);
}

export async function GET() {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: false,
  });

  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, error: authentication.error },
      { status: authentication.status }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: orders, error: ordersError } = await supabase
      .from("nail_tip_orders")
      .select("*")
      .eq("salon_id", authentication.principal.salonId)
      .order("created_at", { ascending: false });

    if (ordersError) {
      return NextResponse.json(
        {
          ok: false,
          error: ordersError.message,
        },
        { status: 500 }
      );
    }

    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("id, name")
      .eq("salon_id", authentication.principal.salonId);

    if (customersError) {
      return NextResponse.json(
        {
          ok: false,
          error: customersError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      orders: orders ?? [],
      customers: customers ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "取得に失敗しました",
      },
      { status: 500 }
    );
  }
}
