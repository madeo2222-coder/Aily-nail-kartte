import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const LINE_PENDING_COOKIE = "customer_line_pending";
const LINE_SESSION_COOKIE = "customer_line_session";

type LineSessionPayload = {
  customer_id: string;
  line_user_id: string;
};

type PendingPayload = {
  line_user_id: string;
  display_name?: string;
  picture_url?: string;
  next?: string;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createClient(url, key);
}

function safeDecodeJson<T>(value: string | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function buildPendingResponse(pending: PendingPayload | null) {
  if (!pending) return null;

  return {
    lineUserId: pending.line_user_id || "",
    displayName: pending.display_name || "",
    pictureUrl: pending.picture_url || "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = safeDecodeJson<LineSessionPayload>(
      request.cookies.get(LINE_SESSION_COOKIE)?.value
    );

    const pending = safeDecodeJson<PendingPayload>(
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
      .select("id, name, salon_id, line_user_id")
      .eq("id", session.customer_id)
      .eq("line_user_id", session.line_user_id)
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