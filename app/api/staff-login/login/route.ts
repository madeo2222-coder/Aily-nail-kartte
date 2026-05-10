import { NextRequest, NextResponse } from "next/server";

const STAFF_SESSION_COOKIE = "staff_session";

type RequestBody = {
  loginId?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    const loginId = body.loginId?.trim() || "";
    const password = body.password?.trim() || "";

    const validId = process.env.STAFF_LOGIN_ID || "";
    const validPassword = process.env.STAFF_LOGIN_PASSWORD || "";

    if (!validId || !validPassword) {
      return NextResponse.json(
        { ok: false, error: "スタッフログイン設定が未完了です。" },
        { status: 500 }
      );
    }

    if (!loginId || !password) {
      return NextResponse.json(
        { ok: false, error: "ログインIDとパスワードを入力してください。" },
        { status: 400 }
      );
    }

    if (loginId !== validId || password !== validPassword) {
      return NextResponse.json(
        { ok: false, error: "ログインIDまたはパスワードが違います。" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set(STAFF_SESSION_COOKIE, "active", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "ログインに失敗しました。" },
      { status: 500 }
    );
  }
}