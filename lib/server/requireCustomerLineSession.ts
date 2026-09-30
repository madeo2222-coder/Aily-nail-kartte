import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import {
  LINE_SESSION_COOKIE,
  readCustomerLineSessionCookie,
} from "@/lib/server/lineLoginCookies";

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

export async function requireCustomerLineSession(
  request: NextRequest
): Promise<AuthenticatedLineCustomer | null> {
  const session = readCustomerLineSessionCookie(
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
