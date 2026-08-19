import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const SETUP_PASSWORD_PATH = "/staff/setup-password";
const AUTH_ERROR_PATH = "/staff/auth-error?reason=invalid_or_expired";

function createRedirect(path: string, origin: string) {
  return NextResponse.redirect(new URL(path, origin));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!tokenHash || type !== "invite") {
    return createRedirect(AUTH_ERROR_PATH, requestUrl.origin);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      return createRedirect(AUTH_ERROR_PATH, requestUrl.origin);
    }

    return createRedirect(SETUP_PASSWORD_PATH, requestUrl.origin);
  } catch {
    return createRedirect(AUTH_ERROR_PATH, requestUrl.origin);
  }
}
