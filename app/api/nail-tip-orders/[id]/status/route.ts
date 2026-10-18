import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

const allowedStatuses = [
  "requested",
  "payment_waiting",
  "paid",
  "making",
  "shipped",
  "completed",
  "cancelled",
];

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
  try {
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

    const { id } = await params;
    const body = await request.json();

    const status = String(body.status || "");

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          error: "不正なステータスです",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const readQuery = supabase.from("nail_tip_orders")
      .select("id, status, payment_status").eq("id", id)
      .eq("salon_id", authentication.principal.salonId);
    const { data: order, error: readError } = await readQuery.maybeSingle();
    if (readError) {
      return NextResponse.json({ ok: false, error: "注文を確認できませんでした" }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ ok: false, error: "注文が見つかりません" }, { status: 404 });
    }
    if (["paid", "making", "shipped", "completed"].includes(status) && order.payment_status !== "paid") {
      return NextResponse.json({ ok: false, error: "決済完了を確認できるまで制作・発送へ進めません" }, { status: 409 });
    }
    if (status === "shipped" && order.status !== "shipped") {
      return NextResponse.json({ ok: false, error: "配送会社と追跡番号を発送情報から登録してください" }, { status: 409 });
    }
    if (status === "completed" && !["shipped", "completed"].includes(order.status)) {
      return NextResponse.json({ ok: false, error: "発送を確認してから完了にしてください" }, { status: 409 });
    }
    // Payment truth is owned by the verified payment flow, never this form.
    let updateQuery = supabase
      .from("nail_tip_orders")
      .update({ status })
      .eq("id", id)
      .eq("salon_id", authentication.principal.salonId);
    updateQuery = order.status === null ? updateQuery.is("status", null) : updateQuery.eq("status", order.status);
    updateQuery = order.payment_status === null ? updateQuery.is("payment_status", null) : updateQuery.eq("payment_status", order.payment_status);
    const { data: updated, error } = await updateQuery.select("id").maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    if (!updated) {
      return NextResponse.json({ ok: false, error: "注文が更新されました。再読込して確認してください" }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "ステータス更新失敗",
      },
      { status: 500 }
    );
  }
}
