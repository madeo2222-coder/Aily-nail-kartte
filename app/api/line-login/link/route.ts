import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const LINE_PENDING_COOKIE = "customer_line_pending";
const LINE_SESSION_COOKIE = "customer_line_session";

type PendingPayload = {
  line_user_id: string;
  display_name?: string;
  picture_url?: string;
  next?: string;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  line_user_id: string | null;
  line_login_id: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createClient(url, key);
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function toLocalPhone(value: string) {
  const normalized = normalizePhone(value);

  if (!normalized) return "";

  if (normalized.startsWith("+81")) {
    return `0${normalized.slice(3)}`;
  }

  if (normalized.startsWith("81")) {
    return `0${normalized.slice(2)}`;
  }

  return normalized;
}

function toInternationalPhone(value: string) {
  const normalized = normalizePhone(value);

  if (!normalized) return "";

  if (normalized.startsWith("+81")) return normalized;
  if (normalized.startsWith("81")) return `+${normalized}`;
  if (normalized.startsWith("0")) return `+81${normalized.slice(1)}`;

  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

function buildPhoneCandidates(value: string) {
  const local = toLocalPhone(value);
  const international = toInternationalPhone(value);

  return Array.from(
    new Set([value, local, international].map(normalizePhone).filter(Boolean))
  );
}

function normalizeName(value: string) {
  return value.replace(/\s/g, "").replace(/　/g, "").trim();
}

function safeDecodeJson<T>(value: string | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getSafeRedirectPath(value: string | undefined) {
  if (!value) return "/customer-app";
  if (!value.startsWith("/")) return "/customer-app";
  if (value.startsWith("//")) return "/customer-app";

  return value;
}

export async function POST(request: NextRequest) {
  try {
    const pending = safeDecodeJson<PendingPayload>(
      request.cookies.get(LINE_PENDING_COOKIE)?.value
    );

    if (!pending?.line_user_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "LINE連携セッションが切れています。もう一度ログインしてください。",
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      phone?: string;
      name?: string;
    };

    const phone = body.phone?.trim() || "";
    const name = body.name?.trim() || "";

    if (!phone || !name) {
      return NextResponse.json(
        { ok: false, error: "お名前と電話番号を入力してください。" },
        { status: 400 }
      );
    }

    const phoneCandidates = buildPhoneCandidates(phone);
    const normalizedInputName = normalizeName(name);

    if (phoneCandidates.length === 0 || !normalizedInputName) {
      return NextResponse.json(
        { ok: false, error: "入力内容を確認してください。" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, line_user_id, line_login_id")
      .in("phone", phoneCandidates);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const matched = ((data || []) as CustomerRow[]).filter((row) => {
      const dbName = normalizeName(row.name || "");
      return dbName === normalizedInputName;
    });

    if (matched.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "一致する顧客が見つかりませんでした。店舗に登録しているお名前と電話番号でご確認ください。",
        },
        { status: 404 }
      );
    }

    if (matched.length > 1) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "同じ条件の顧客が複数見つかりました。店舗側で顧客整理が必要です。",
        },
        { status: 409 }
      );
    }

    const customer = matched[0];

    const { error: updateError } = await supabase
      .from("customers")
      .update({
        line_login_id: pending.line_user_id,
      })
      .eq("id", customer.id);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    const redirectTo = getSafeRedirectPath(pending.next);

    const response = NextResponse.json({
      ok: true,
      redirectTo,
      replaced: Boolean(
        customer.line_login_id &&
          customer.line_login_id !== pending.line_user_id
      ),
      hasMessagingLineUserId: Boolean(customer.line_user_id),
    });

    response.cookies.set(
      LINE_SESSION_COOKIE,
      JSON.stringify({
        customer_id: customer.id,
        line_user_id: pending.line_user_id,
      }),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      }
    );

    response.cookies.set(LINE_PENDING_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "連携処理に失敗しました。",
      },
      { status: 500 }
    );
  }
}