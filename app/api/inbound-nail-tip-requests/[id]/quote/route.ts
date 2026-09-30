import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase環境変数不足");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });

  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, error: authentication.error },
      { status: authentication.status }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const quoteAmount = Number(body.quoteAmount);

    if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "見積金額を入力してください",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("inbound_nail_tip_requests")
      .update({
        quote_amount: quoteAmount,
        status: "quoted",
      })
      .eq("id", id);

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
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "見積保存失敗",
      },
      { status: 500 }
    );
  }
}
