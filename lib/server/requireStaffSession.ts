import { NextRequest, NextResponse } from "next/server";

import {
  STAFF_SESSION_COOKIE,
  verifyLegacyStaffSession,
} from "@/lib/auth/staffLegacySession";

export async function requireStaffSession(request: NextRequest) {
  const staffSession = request.cookies.get(STAFF_SESSION_COOKIE)?.value;

  if (!(await verifyLegacyStaffSession(staffSession))) {
    return NextResponse.json(
      { error: "スタッフ認証が必要です。" },
      { status: 401 }
    );
  }

  return null;
}