import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const STAFF_SESSION_COOKIE = "staff_session";
const STAFF_ROLE_COOKIE = "staff_role";
const LOGIN_PATH = "/login";

function clearLegacyStaffCookies(response: NextResponse) {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };

  response.cookies.set(STAFF_SESSION_COOKIE, "", cookieOptions);
  response.cookies.set(STAFF_ROLE_COOKIE, "", cookieOptions);
}

export async function POST() {
  let signOutFailed = false;

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    signOutFailed = Boolean(error);
  } catch {
    signOutFailed = true;
  }

  const response = signOutFailed
    ? NextResponse.json(
      {
        ok: false,
        error:
          "現在ログアウトできません。時間をおいて再度お試しください。",
        redirectTo: LOGIN_PATH,
      },
      { status: 500 }
    )
    : NextResponse.json({ ok: true, redirectTo: LOGIN_PATH });

  clearLegacyStaffCookies(response);
  return response;
}
