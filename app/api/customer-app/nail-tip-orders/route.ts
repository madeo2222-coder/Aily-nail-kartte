import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") || "";

    const meRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/line-login/me`,
      {
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      }
    );

    const meJson = await meRes.json();

    if (!meJson.authenticated || !meJson.customer?.id) {
      return NextResponse.json({
        ok: true,
        orders: [],
      });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("nail_tip_orders")
      .select(
        `
        id,
        design_request,
        payment_url,
        payment_due_at,
        payment_status,
        status,
        created_at
      `
      )
      .eq("customer_id", meJson.customer.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          orders: [],
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      orders: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "ネイルチップ注文取得に失敗しました",
        orders: [],
      },
      { status: 500 }
    );
  }
}