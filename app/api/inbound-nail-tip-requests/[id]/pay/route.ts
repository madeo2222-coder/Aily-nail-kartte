import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const body = await request.json();

    const token = String(body.token || "").trim();

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "カードトークンがありません",
        },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("inbound_nail_tip_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          ok: false,
          error: "データが見つかりません",
        },
        { status: 404 }
      );
    }

    /*
      =======================================
      ここでDG決済(MDK)を実行
      =======================================
    */

    console.log("DG Token =", token);

    /*
      仮成功
    */

    await supabase
      .from("inbound_nail_tip_requests")
      .update({
        payment_status: "paid",
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
    });
  } catch (e) {
    console.error(e);

    return NextResponse.json(
      {
        ok: false,
        error: "決済失敗",
      },
      {
        status: 500,
      }
    );
  }
}