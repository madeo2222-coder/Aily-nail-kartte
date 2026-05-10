import { NextRequest, NextResponse } from "next/server";

const STAFF_SESSION_COOKIE = "staff_session";

export function requireStaffSession(request: NextRequest) {
  const staffSession = request.cookies.get(STAFF_SESSION_COOKIE)?.value;

  if (!staffSession) {
    return NextResponse.json(
      { error: "スタッフ認証が必要です。" },
      { status: 401 }
    );
  }

  return null;
}