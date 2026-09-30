import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  LINE_PENDING_COOKIE,
  LINE_SESSION_COOKIE,
  type LinePendingPayload,
  readCustomerLineSessionCookie,
  readLinePendingCookie,
} from "@/lib/server/lineLoginCookies";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createClient(url, key);
}

function buildPendingResponse(pending: LinePendingPayload | null) {
  if (!pending) return null;

  return {
    lineUserId: pending.line_user_id || "",
    displayName: pending.display_name || "",
    pictureUrl: pending.picture_url || "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = readCustomerLineSessionCookie(
      request.cookies.get(LINE_SESSION_COOKIE)?.value
    );

    const pending = readLinePendingCookie(
      request.cookies.get(LINE_PENDING_COOKIE)?.value
    );

    if (!session?.customer_id || !session.line_user_id) {
      return NextResponse.json({
        authenticated: false,
        customer: null,
        pending: buildPendingResponse(pending),
      });
    }

    const supabase = getSupabaseAdmin();

    const { data: customer, error } = await supabase
      .from("customers")
      .select("id, name, salon_id, line_user_id, line_login_id")
      .eq("id", session.customer_id)
      .eq("line_login_id", session.line_user_id)
      .maybeSingle();

    if (error || !customer) {
      const response = NextResponse.json({
        authenticated: false,
        customer: null,
        pending: buildPendingResponse(pending),
      });

      response.cookies.set(LINE_SESSION_COOKIE, "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    return NextResponse.json({
      authenticated: true,
      customer,
      pending: null,
    });
  } catch {
    return NextResponse.json({
      authenticated: false,
      customer: null,
      pending: null,
    });
  }
}
