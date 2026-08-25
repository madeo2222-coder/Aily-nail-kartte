import { NextRequest, NextResponse } from "next/server";

import {
  createLegacyStaffSession,
  STAFF_ROLE_COOKIE,
  STAFF_SESSION_COOKIE,
} from "@/lib/auth/staffLegacySession";

type LoginRole = "staff" | "owner";

type RequestBody = {
  loginId?: string;
  password?: string;
};

function getRedirectPath(role: LoginRole) {
  return role === "owner" ? "/owner-dashboard" : "/dashboard";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    const loginId = body.loginId?.trim() || "";
    const password = body.password?.trim() || "";

    const staffId = process.env.STAFF_LOGIN_ID?.trim() || "";
    const staffPassword =
      process.env.STAFF_LOGIN_PASSWORD?.trim() || "";

    const ownerId = process.env.OWNER_LOGIN_ID?.trim() || "";
    const ownerPassword =
      process.env.OWNER_LOGIN_PASSWORD?.trim() || "";

    if (!staffId || !staffPassword || !ownerId || !ownerPassword) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "スタッフまたはオーナーのログイン設定が未完了です。",
        },
        { status: 500 }
      );
    }

    if (!loginId || !password) {
      return NextResponse.json(
        {
          ok: false,
          error: "ログインIDとパスワードを入力してください。",
        },
        { status: 400 }
      );
    }

    let role: LoginRole | null = null;

    if (loginId === ownerId && password === ownerPassword) {
      role = "owner";
    } else if (
      loginId === staffId &&
      password === staffPassword
    ) {
      role = "staff";
    }

    if (!role) {
      return NextResponse.json(
        {
          ok: false,
          error: "ログインIDまたはパスワードが違います。",
        },
        { status: 401 }
      );
    }

    const redirectTo = getRedirectPath(role);
    const staffSession = await createLegacyStaffSession(role);

    if (!staffSession) {
      return NextResponse.json(
        { ok: false, error: "ログインに失敗しました。" },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      role,
      redirectTo,
    });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 12,
    };

    response.cookies.set(
      STAFF_SESSION_COOKIE,
      staffSession,
      cookieOptions
    );

    response.cookies.set(
      STAFF_ROLE_COOKIE,
      role,
      cookieOptions
    );

    return response;
  } catch (error) {
    console.error("スタッフログインエラー:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "ログインに失敗しました。",
      },
      { status: 500 }
    );
  }
}
