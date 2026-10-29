import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
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

function getFromEmail() {
  return (
    process.env.RESEND_FROM_EMAIL ||
    "Aily Nail Studio <onboarding@resend.dev>"
  );
}

function buildIdempotencyKey(params: {
  requestId: string;
  customerEmail: string;
  quoteAmount: number;
  paymentUrl: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        params.requestId,
        params.customerEmail,
        String(params.quoteAmount),
        params.paymentUrl,
      ].join("\u001f")
    )
    .digest("hex")
    .slice(0, 32);

  return `inbound-quote/${params.requestId}/${digest}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner"],
    legacyAllowed: false,
  });

  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, error: authentication.error },
      { status: authentication.status }
    );
  }

  try {
    const { id } = await params;

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("inbound_nail_tip_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: "相談が見つかりません" },
        { status: 404 }
      );
    }

    const customerName = data.customer_name || "Customer";
    const customerEmail = data.customer_email;
    const quoteAmount = Number(data.quote_amount || 0);
    const paymentUrl = String(data.payment_url || "").trim();

    if (!customerEmail) {
      return NextResponse.json(
        { ok: false, error: "メールアドレス未登録" },
        { status: 400 }
      );
    }

    if (quoteAmount <= 0) {
      return NextResponse.json(
        { ok: false, error: "見積金額未設定" },
        { status: 400 }
      );
    }

    if (!paymentUrl) {
      return NextResponse.json(
        { ok: false, error: "DG決済URL未登録" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      return NextResponse.json(
        { ok: false, error: "RESEND_API_KEY未設定" },
        { status: 500 }
      );
    }

    const text = [
      `Hello ${customerName},`,
      "",
      "Your quote is ready.",
      "",
      `Amount: ¥${quoteAmount.toLocaleString("ja-JP")}`,
      "",
      "Payment URL:",
      paymentUrl,
      "",
      "After payment confirmation, we will start production.",
      "",
      "If you have any questions, please contact us by email or Instagram.",
      "",
      "Aily Nail Studio",
    ].join("\n");

    const idempotencyKey = buildIdempotencyKey({
      requestId: id,
      customerEmail,
      quoteAmount,
      paymentUrl,
    });

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: getFromEmail(),
        to: [customerEmail],
        subject: "Aily Nail Studio - Quote and Payment URL",
        text,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();

      return NextResponse.json(
        {
          ok: false,
          error: errorText,
        },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("inbound_nail_tip_requests")
      .update({
        status: "payment_waiting",
        payment_status: "unpaid",
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          emailAccepted: true,
          idempotencyProtected: true,
          error:
            "見積メールは受付済みですが、相談状態を更新できませんでした。再送せず管理画面を再読み込みしてください。",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      idempotencyProtected: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "見積メール送信失敗",
      },
      { status: 500 }
    );
  }
}
