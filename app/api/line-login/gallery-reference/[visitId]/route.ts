import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LINE_SESSION_COOKIE = "customer_line_session";

type LineSessionPayload = {
  customer_id: string;
  line_user_id: string;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase環境変数が不足しています");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

function safeDecodeJson<T>(value: string | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isUsefulGalleryText(value: string | null | undefined) {
  const text = String(value || "").trim();

  if (!text) return false;
  if (/^\d+$/.test(text)) return false;
  if (/^\d+\s*分$/.test(text)) return false;

  return true;
}

function getGalleryMenuName(visit: {
  menu_name: string | null;
  menu: string | null;
}) {
  if (isUsefulGalleryText(visit.menu_name)) {
    return String(visit.menu_name).trim();
  }

  if (isUsefulGalleryText(visit.menu)) {
    return String(visit.menu).trim();
  }

  return "";
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ visitId: string }>;
  }
) {
  try {
    const session = safeDecodeJson<LineSessionPayload>(
      request.cookies.get(LINE_SESSION_COOKIE)?.value
    );

    if (!session?.customer_id || !session.line_user_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "LINEログインが必要です",
        },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, line_login_id")
      .eq("id", session.customer_id)
      .eq("line_login_id", session.line_user_id)
      .maybeSingle();

    if (customerError || !customer) {
      return NextResponse.json(
        {
          ok: false,
          error: "顧客情報を確認できません",
        },
        { status: 401 }
      );
    }

    const { visitId } = await context.params;

    if (!visitId) {
      return NextResponse.json(
        {
          ok: false,
          error: "来店IDがありません",
        },
        { status: 400 }
      );
    }

    const { data: visit, error: visitError } = await supabaseAdmin
      .from("visits")
      .select("id, customer_id, menu_name, menu, color, visit_date")
      .eq("id", visitId)
      .eq("customer_id", customer.id)
      .maybeSingle();

    if (visitError) {
      return NextResponse.json(
        {
          ok: false,
          error: visitError.message,
        },
        { status: 500 }
      );
    }

    if (!visit) {
      return NextResponse.json(
        {
          ok: false,
          error: "本人の施術履歴として確認できません",
        },
        { status: 404 }
      );
    }

    const { data: photos, error: photoError } = await supabaseAdmin
      .from("visit_photos")
      .select("id, visit_id, image_url, created_at")
      .eq("visit_id", visit.id)
      .not("image_url", "is", null)
      .order("created_at", { ascending: true })
      .limit(1);

    if (photoError) {
      return NextResponse.json(
        {
          ok: false,
          error: photoError.message,
        },
        { status: 500 }
      );
    }

    const firstPhoto = (photos || [])[0] || null;

    return NextResponse.json({
      ok: true,
      reference: {
        visitId: visit.id,
        photoUrl: firstPhoto?.image_url || null,
        menuName: getGalleryMenuName(visit),
        color: visit.color?.trim() || null,
        visitDate: visit.visit_date || null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ギャラリー参照情報の取得に失敗しました";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}