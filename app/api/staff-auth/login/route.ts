import { NextResponse } from "next/server";

import { authenticateStaff } from "@/lib/server/staffAuthentication";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createLegacyStaffSession,
  STAFF_ROLE_COOKIE,
  STAFF_SESSION_COOKIE,
} from "@/lib/auth/staffLegacySession";

const MAXIMUM_EMAIL_LENGTH = 320;
const MAXIMUM_PASSWORD_LENGTH = 1024;

type LoginRequestBody = {
  email?: unknown;
  password?: unknown;
};

function inputErrorResponse() {
  return NextResponse.json(
    { ok: false, error: "入力内容を確認してください。" },
    { status: 400 }
  );
}

function loginErrorResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "メールアドレスまたはパスワードを確認してください。",
    },
    { status: 401 }
  );
}

function unauthorizedResponse() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "このアカウントではログインできません。管理者へお問い合わせください。",
    },
    { status: 403 }
  );
}

function internalErrorResponse() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "現在ログインできません。時間をおいて再度お試しください。",
    },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  let body: LoginRequestBody;

  try {
    const parsedBody: unknown = await request.json();

    if (
      typeof parsedBody !== "object" ||
      parsedBody === null ||
      Array.isArray(parsedBody)
    ) {
      return inputErrorResponse();
    }

    body = parsedBody as LoginRequestBody;
  } catch {
    return inputErrorResponse();
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return inputErrorResponse();
  }

  const email = body.email.trim();
  const password = body.password;

  if (
    email.length === 0 ||
    password.length === 0 ||
    email.length > MAXIMUM_EMAIL_LENGTH ||
    password.length > MAXIMUM_PASSWORD_LENGTH
  ) {
    return inputErrorResponse();
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError || !data.user || !data.session) {
      return loginErrorResponse();
    }

    const staffAuthentication = await authenticateStaff();

    if (!staffAuthentication.ok) {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        return internalErrorResponse();
      }

      if (staffAuthentication.category === "unauthorized") {
        return unauthorizedResponse();
      }

      return internalErrorResponse();
    }

    const { role } = staffAuthentication.staff;
    const redirectTo =
      role === "owner" ? "/owner-dashboard" : "/dashboard";
    const staffSession = await createLegacyStaffSession(role);

    if (!staffSession) {
      return internalErrorResponse();
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
  } catch {
    return internalErrorResponse();
  }
}