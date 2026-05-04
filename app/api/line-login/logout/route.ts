import { NextResponse } from "next/server";

const LINE_PENDING_COOKIE = "customer_line_pending";
const LINE_SESSION_COOKIE = "customer_line_session";
const LINE_STATE_COOKIE = "line_login_state";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  for (const name of [
    LINE_PENDING_COOKIE,
    LINE_SESSION_COOKIE,
    LINE_STATE_COOKIE,
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}