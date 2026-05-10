import { NextRequest, NextResponse } from "next/server";

const STAFF_SESSION_COOKIE = "staff_session";
const STAFF_ROLE_COOKIE = "staff_role";

type RequestBody = {
  loginId?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    const loginId = body.loginId?.trim() || "";
    const password = body.password?.trim() || "";

    const staffId = process.env.STAFF_LOGIN_ID || "";
    const staffPassword = process.env.STAFF_LOGIN_PASSWORD || "";
    const ownerId = process.env.OWNER_LOGIN_ID || "";
    const ownerPassword = process.env.OWNER_LOGIN_PASSWORD || "";

    if (!staffId || !staffPassword || !ownerId || !ownerPassword) {
      return NextResponse.json(
        { ok: false, error: "スタッフ/オーナーログイン設定が未完了です。" },
        { status: 500 }
      );
    }

    if (!loginId || !password) {
      return NextResponse.json(
        { ok: false, error: "ログインIDとパスワードを入力してください。" },
        { status: 400 }
      );
    }

    let role: "staff" | "owner" | null = null;

    if (loginId === ownerId && password === ownerPassword) {
      role = "owner";
    } else if (loginId === staffId && password === staffPassword) {
      role = "staff";
    }

    if (!role) {
      return NextResponse.json(
        { ok: false, error: "ログインIDまたはパスワードが違います。" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true, role });

    response.cookies.set(STAFF_SESSION_COOKIE, "active", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    response.cookies.set(STAFF_ROLE_COOKIE, role, {
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