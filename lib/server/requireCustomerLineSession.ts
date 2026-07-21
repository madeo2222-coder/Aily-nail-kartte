import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

const LINE_SESSION_COOKIE = "customer_line_session";

type LineSessionPayload = {
  customer_id: string;
  line_user_id: string;
};

export type AuthenticatedLineCustomer = {
  id: string;
  name: string | null;
  salonId: string | null;
};

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

function parseSession(value: string | undefined): LineSessionPayload | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<LineSessionPayload>;

    if (
      typeof parsed.customer_id !== "string" ||
      !parsed.customer_id.trim() ||
      typeof parsed.line_user_id !== "string" ||
      !parsed.line_user_id.trim()
    ) {
      return null;
    }

    return {
      customer_id: parsed.customer_id.trim(),
      line_user_id: parsed.line_user_id.trim(),
    };
  } catch {
    return null;
  }
}

export async function requireCustomerLineSession(
  request: NextRequest
): Promise<AuthenticatedLineCustomer | null> {
  const session = parseSession(
    request.cookies.get(LINE_SESSION_COOKIE)?.value
  );

  if (!session) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, name, salon_id, line_login_id")
    .eq("id", session.customer_id)
    .eq("line_login_id", session.line_user_id)
    .maybeSingle();

  if (error) {
    throw new Error("Customer session lookup failed.");
  }

  if (!data) return null;

  return {
    id: String(data.id),
    name: typeof data.name === "string" ? data.name : null,
    salonId: typeof data.salon_id === "string" ? data.salon_id : null,
  };
}

export { getSupabaseAdmin };
