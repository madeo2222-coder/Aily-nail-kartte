import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LINE_SESSION_COOKIE = "customer_line_session";

type LineSessionPayload = {
  customer_id: string;
  line_user_id: string;
};

type AnyRow = Record<string, unknown>;

type UpdateRequestBody = {
  action?: "update" | "cancel" | "request_change" | "request_cancel";
  date?: string;
  time?: string;
  menu?: string;
  staffId?: string;
  memo?: string;
  durationMinutes?: number;
  requestMessage?: string;
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

function getString(row: AnyRow | null, keys: string[]) {
  if (!row) return "";

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeDurationMinutes(value: unknown) {
  const minutes = Number(value);

  if (!Number.isFinite(minutes)) return 90;
  if (minutes < 30) return 30;
  if (minutes > 360) return 360;

  return Math.round(minutes);
}

function isRequestedStatus(status: string) {
  return (
    status === "requested" ||
    status === "予約申請中" ||
    status === "予約受付" ||
    status === "予約"
  );
}

function isConfirmedStatus(status: string) {
  return status === "confirmed" || status === "予約確定";
}

function isCancelledStatus(status: string | null | undefined) {
  return status === "cancelled" || status === "キャンセル";
}

function isExternalReservation(row: AnyRow) {
  const source = getString(row, ["source"]).toLowerCase();
  const memo = getString(row, ["memo", "note"]).toLowerCase();

  return (
    source.includes("hpb") ||
    source.includes("hotpepper") ||
    source.includes("hot pepper") ||
    source.includes("minimo") ||
    source.includes("ミニモ") ||
    memo.includes("hpb予約番号") ||
    memo.includes("ホットペッパー") ||
    memo.includes("ミニモ予約id") ||
    memo.includes("ミニモ")
  );
}

function getTodayJstText() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function addDaysText(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function buildUtcIsoFromJst(dateText: string, timeText: string) {
  const date = new Date(`${dateText}T${timeText}:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function getAuthenticatedCustomer(request: NextRequest) {
  const session = safeDecodeJson<LineSessionPayload>(
    request.cookies.get(LINE_SESSION_COOKIE)?.value
  );

  if (!session?.customer_id || !session.line_user_id) {
    return null;
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: customer, error } = await supabaseAdmin
    .from("customers")
    .select("id, name, salon_id, line_user_id, line_login_id")
    .eq("id", session.customer_id)
    .eq("line_login_id", session.line_user_id)
    .maybeSingle();

  if (error || !customer) {
    return null;
  }

  return customer as AnyRow;
}

async function getOwnedReservation(params: {
  reservationId: string;
  customerId: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("reservations")
    .select("*")
    .eq("id", params.reservationId)
    .eq("customer_id", params.customerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data || null) as AnyRow | null;
}

async function sendAdminLineMessage(text: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const adminUserId = process.env.LINE_ADMIN_USER_ID;

  if (!accessToken || !adminUserId) {
    console.log(
      "管理者LINE通知をスキップしました: LINE_CHANNEL_ACCESS_TOKEN または LINE_ADMIN_USER_ID が未設定です"
    );
    return false;
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: adminUserId,
      messages: [
        {
          type: "text",
          text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("管理者LINE通知エラー:", errorText);
    return false;
  }

  return true;
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const customer = await getAuthenticatedCustomer(request);

    if (!customer) {
      return NextResponse.json(
        {
          ok: false,
          error: "LINEログインが必要です",
        },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const customerId = getString(customer, ["id"]);

    const reservation = await getOwnedReservation({
      reservationId: id,
      customerId,
    });

    if (!reservation) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約情報が見つかりません",
        },
        { status: 404 }
      );
    }

    const staffId = getString(reservation, ["staff_id"]);
    let staffName = "指名なし";

    if (staffId) {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: staff } = await supabaseAdmin
        .from("staffs")
        .select("id, name")
        .eq("id", staffId)
        .maybeSingle();

      if (staff?.name) {
        staffName = staff.name;
      }
    }

    const status = getString(reservation, ["status"]) || "requested";
    const externalReservation = isExternalReservation(reservation);

    return NextResponse.json({
      ok: true,
      reservation: {
        id: getString(reservation, ["id"]),
        customerId,
        menu: getString(reservation, ["menu", "menu_name"]),
        memo: getString(reservation, ["memo", "note"]),
        status,
        staffId,
        staffName,
        salonId: getString(reservation, ["salon_id"]),
        source: getString(reservation, ["source"]) || "customer-app",
        startAt: getString(reservation, ["start_at"]),
        endAt: getString(reservation, ["end_at"]),
        externalReservation,
        canDirectEdit: isRequestedStatus(status) && !externalReservation,
        canDirectCancel: isRequestedStatus(status) && !externalReservation,
        canRequestChange: isConfirmedStatus(status) && !externalReservation,
        canRequestCancel: isConfirmedStatus(status) && !externalReservation,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "予約情報の取得に失敗しました";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const customer = await getAuthenticatedCustomer(request);

    if (!customer) {
      return NextResponse.json(
        {
          ok: false,
          error: "LINEログインが必要です",
        },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const customerId = getString(customer, ["id"]);
    const customerName = getString(customer, ["name"]) || "お客様";

    const reservation = await getOwnedReservation({
      reservationId: id,
      customerId,
    });

    if (!reservation) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約情報が見つかりません",
        },
        { status: 404 }
      );
    }

    if (isExternalReservation(reservation)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "HPB・ミニモから登録された予約は、予約元サービスから変更してください",
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as UpdateRequestBody;
    const action = body.action;
    const currentStatus = getString(reservation, ["status"]) || "requested";

    if (!action) {
      return NextResponse.json(
        {
          ok: false,
          error: "操作内容がありません",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (action === "cancel") {
      if (!isRequestedStatus(currentStatus)) {
        return NextResponse.json(
          {
            ok: false,
            error: "予約確定後は直接取り消しできません",
          },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin
        .from("reservations")
        .update({
          status: "cancelled",
        })
        .eq("id", id)
        .eq("customer_id", customerId);

      if (error) {
        throw new Error(error.message);
      }

      await sendAdminLineMessage(
        [
          "💅 予約希望が取り消されました",
          "",
          `お客様名：${customerName}`,
          `予約日時：${formatDateTime(
            getString(reservation, ["start_at"])
          )}`,
          `メニュー：${
            getString(reservation, ["menu", "menu_name"]) || "未設定"
          }`,
        ].join("\n")
      );

      return NextResponse.json({
        ok: true,
        message: "予約希望を取り消しました",
      });
    }

    if (action === "request_change" || action === "request_cancel") {
      if (!isConfirmedStatus(currentStatus)) {
        return NextResponse.json(
          {
            ok: false,
            error: "確定済み予約ではありません",
          },
          { status: 400 }
        );
      }

      const requestMessage = String(body.requestMessage || "").trim();

      const title =
        action === "request_cancel"
          ? "予約キャンセル希望が届きました"
          : "予約変更希望が届きました";

      await sendAdminLineMessage(
        [
          `💅 ${title}`,
          "",
          `お客様名：${customerName}`,
          `現在の予約日時：${formatDateTime(
            getString(reservation, ["start_at"])
          )}`,
          `メニュー：${
            getString(reservation, ["menu", "menu_name"]) || "未設定"
          }`,
          "",
          "お客様からのご希望：",
          requestMessage || "詳細記載なし",
          "",
          `予約ID：${id}`,
        ].join("\n")
      );

      return NextResponse.json({
        ok: true,
        message:
          action === "request_cancel"
            ? "キャンセル希望を店舗へ送りました"
            : "変更希望を店舗へ送りました",
      });
    }

    if (action !== "update") {
      return NextResponse.json(
        {
          ok: false,
          error: "対応していない操作です",
        },
        { status: 400 }
      );
    }

    if (!isRequestedStatus(currentStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約確定後は直接変更できません",
        },
        { status: 400 }
      );
    }

    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const menu = String(body.menu || "").trim();
    const staffId = String(body.staffId || "").trim();
    const memo = String(body.memo || "").trim();
    const durationMinutes = normalizeDurationMinutes(body.durationMinutes);

    if (!date || !time || !menu) {
      return NextResponse.json(
        {
          ok: false,
          error: "日付・時間・メニューを入力してください",
        },
        { status: 400 }
      );
    }

    const todayText = getTodayJstText();
    const maxDateText = addDaysText(todayText, 30);

    if (date < todayText) {
      return NextResponse.json(
        {
          ok: false,
          error: "過去の日付には変更できません",
        },
        { status: 400 }
      );
    }

    if (date > maxDateText) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約は本日から30日先まで変更できます",
        },
        { status: 400 }
      );
    }

    const startIso = buildUtcIsoFromJst(date, time);

    if (!startIso) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約日時が正しくありません",
        },
        { status: 400 }
      );
    }

    const startDate = new Date(startIso);
    const endDate = new Date(
      startDate.getTime() + durationMinutes * 60 * 1000
    );
    const endIso = endDate.toISOString();

    const salonId = getString(reservation, ["salon_id"]);

    let overlapQuery = supabaseAdmin
      .from("reservations")
      .select("id, status, staff_id, start_at, end_at")
      .neq("id", id)
      .lt("start_at", endIso)
      .gt("end_at", startIso);

    if (salonId) {
      overlapQuery = overlapQuery.eq("salon_id", salonId);
    }

    if (staffId) {
      overlapQuery = overlapQuery.eq("staff_id", staffId);
    }

    const { data: overlaps, error: overlapError } = await overlapQuery;

    if (overlapError) {
      throw new Error(overlapError.message);
    }

    const activeOverlaps = (overlaps || []).filter(
      (item) => !isCancelledStatus(item.status)
    );

    if (activeOverlaps.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: staffId
            ? "選択した担当者はその時間帯に既に予約があります"
            : "その時間帯には既に予約があります",
        },
        { status: 400 }
      );
    }

    const previousStartAt = getString(reservation, ["start_at"]);
    const previousMenu =
      getString(reservation, ["menu", "menu_name"]) || "未設定";

    const updatePayload: {
      start_at: string;
      end_at: string;
      menu: string;
      memo: string;
      source: string;
      staff_id?: string | null;
    } = {
      start_at: startIso,
      end_at: endIso,
      menu,
      memo,
      source: "customer-app",
      staff_id: staffId || null,
    };

    const { error: updateError } = await supabaseAdmin
      .from("reservations")
      .update(updatePayload)
      .eq("id", id)
      .eq("customer_id", customerId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await sendAdminLineMessage(
      [
        "💅 予約希望が変更されました",
        "",
        `お客様名：${customerName}`,
        `変更前日時：${formatDateTime(previousStartAt)}`,
        `変更後日時：${formatDateTime(startIso)}`,
        `変更前メニュー：${previousMenu}`,
        `変更後メニュー：${menu}`,
        `担当：${staffId ? "指名あり" : "指名なし"}`,
        "",
        "備考：",
        memo || "-",
      ].join("\n")
    );

    return NextResponse.json({
      ok: true,
      message: "予約希望を変更しました",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "予約操作に失敗しました";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}