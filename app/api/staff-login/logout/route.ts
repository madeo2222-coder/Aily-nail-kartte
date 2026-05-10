import { NextResponse } from "next/server";

const STAFF_SESSION_COOKIE = "staff_session";
const STAFF_ROLE_COOKIE = "staff_role";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(STAFF_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(STAFF_ROLE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}