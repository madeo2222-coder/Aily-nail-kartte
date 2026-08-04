import { NextResponse } from "next/server";

import { authenticateStaff } from "@/lib/server/staffAuthentication";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

    return NextResponse.json({
      ok: true,
      role,
      redirectTo,
    });
  } catch {
    return internalErrorResponse();
  }
}
