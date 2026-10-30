import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  LINE_SESSION_COOKIE,
  readCustomerLineSessionCookie,
} from "@/lib/server/lineLoginCookies";
import {
  getCustomerReservationAvailability,
  isValidCustomerBookingDate,
  normalizeCustomerBookingDuration,
} from "@/lib/server/customerReservationAvailability";

export const dynamic = "force-dynamic";

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
  expectedRequestRevision?: string;
};

type ReservationWriteRow = {
  outcome: string;
  reservation_id: string | null;
};

type AdminLineDeliveryResult = {
  accepted: boolean;
  alreadyAccepted: boolean;
  retryable: boolean;
  status: "sent" | "failed" | "unknown" | "not_configured";
};

const LINE_TEXT_MAX_CODE_UNITS = 5_000;

function getReservationWriteRow(value: unknown): ReservationWriteRow | null {
  const row = Array.isArray(value) ? value[0] : value;

  if (!row || typeof row !== "object") return null;

  const candidate = row as Record<string, unknown>;
  if (
    typeof candidate.outcome !== "string" ||
    (candidate.reservation_id !== null &&
      typeof candidate.reservation_id !== "string")
  ) {
    return null;
  }

  return candidate as ReservationWriteRow;
}

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

function normalizeReservationWorkflowStatus(status: string) {
  return status.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function isRequestedStatus(status: string) {
  const normalized = normalizeReservationWorkflowStatus(status);

  return (
    normalized === "requested" ||
    normalized === "予約申請中" ||
    normalized === "予約受付" ||
    normalized === "予約"
  );
}

function isConfirmedStatus(status: string) {
  const normalized = normalizeReservationWorkflowStatus(status);

  return normalized === "confirmed" || normalized === "予約確定";
}

function isExternalReservation(row: AnyRow) {
  const source = getString(row, ["source"])
    .normalize("NFKC")
    .toLowerCase();
  const memo = getString(row, ["memo", "note"])
    .normalize("NFKC")
    .toLowerCase();

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
  const session = readCustomerLineSessionCookie(
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

  if (error) {
    throw new Error("顧客認証状態の確認に失敗しました");
  }

  if (!customer) {
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
    throw new Error("予約情報の取得に失敗しました");
  }

  return (data || null) as AnyRow | null;
}

function createAdminLineRetryKey(parts: string[]) {
  const hex = createHash("sha256").update(parts.join("\u001f")).digest("hex");
  const variant = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function createCustomerRequestRevision(params: {
  reservation: AnyRow;
  customerId: string;
  customerName: string;
}) {
  return createHash("sha256")
    .update(
      [
        getString(params.reservation, ["id"]),
        params.customerId,
        params.customerName,
        getString(params.reservation, ["status"]),
        getString(params.reservation, ["start_at"]),
        getString(params.reservation, ["end_at"]),
        getString(params.reservation, ["menu", "menu_name"]),
        getString(params.reservation, ["staff_id"]),
        getString(params.reservation, ["salon_id"]),
        getString(params.reservation, ["updated_at"]),
      ].join("\u001f")
    )
    .digest("base64url");
}

async function sendAdminLineMessage(
  text: string,
  retryKey?: string
): Promise<AdminLineDeliveryResult> {
  // LINE counts text length in UTF-16 code units, which matches JavaScript's
  // String.length. Reject an over-limit request locally so a known-invalid
  // payload never reaches the external API.
  if (text.length > LINE_TEXT_MAX_CODE_UNITS) {
    return {
      accepted: false,
      alreadyAccepted: false,
      retryable: false,
      status: "failed",
    };
  }

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const adminUserId = process.env.LINE_ADMIN_USER_ID;

  if (!accessToken || !adminUserId) {
    console.log(
      "管理者LINE通知をスキップしました: LINE_CHANNEL_ACCESS_TOKEN または LINE_ADMIN_USER_ID が未設定です"
    );
    return {
      accepted: false,
      alreadyAccepted: false,
      retryable: false,
      status: "not_configured",
    };
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}),
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
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      return {
        accepted: true,
        alreadyAccepted: false,
        retryable: false,
        status: "sent",
      };
    }

    const acceptedRequestId = response.headers
      .get("x-line-accepted-request-id")
      ?.trim();

    if (response.status === 409 && acceptedRequestId) {
      return {
        accepted: true,
        alreadyAccepted: true,
        retryable: false,
        status: "sent",
      };
    }

    console.error("管理者LINE通知エラー:", response.status);

    return {
      accepted: false,
      alreadyAccepted: false,
      retryable:
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
      status: "failed",
    };
  } catch (error) {
    console.error("管理者LINE通知の応答を確認できませんでした", error);

    return {
      accepted: false,
      alreadyAccepted: false,
      retryable: true,
      status: "unknown",
    };
  }
}

function getAdminLineWarning(delivery: AdminLineDeliveryResult) {
  if (delivery.accepted) return "";

  return delivery.status === "unknown"
    ? "予約操作は完了しましたが、店舗LINEの送信結果を確認できませんでした。必要に応じて店舗へ直接ご連絡ください"
    : "予約操作は完了しましたが、店舗LINEへ通知できませんでした。必要に応じて店舗へ直接ご連絡ください";
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

      const { data: staff, error: staffError } = await supabaseAdmin
        .from("staffs")
        .select("id, name")
        .eq("id", staffId)
        .eq("salon_id", getString(reservation, ["salon_id"]))
        .maybeSingle();

      if (staffError) {
        throw new Error("担当スタッフ情報の取得に失敗しました");
      }

      if (staff?.name) {
        staffName = staff.name;
      } else {
        staffName = "担当者情報なし";
      }
    }

    const status = getString(reservation, ["status"]) || "requested";
    const externalReservation = isExternalReservation(reservation);
    const customerName = getString(customer, ["name"]) || "お客様";

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
        requestRevision: createCustomerRequestRevision({
          reservation,
          customerId,
          customerName,
        }),
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

      const { data: cancelData, error } = await supabaseAdmin.rpc(
        "cancel_customer_requested_reservation",
        {
          p_reservation_id: id,
          p_customer_id: customerId,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      const cancelResult = getReservationWriteRow(cancelData);

      if (!cancelResult) {
        throw new Error("予約取消結果を確認できませんでした");
      }

      if (
        cancelResult.outcome === "stale" ||
        cancelResult.outcome === "not_found"
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "予約状態が更新されています。最新の内容を読み込み直してください",
          },
          { status: 409 }
        );
      }

      if (
        cancelResult.outcome !== "cancelled" ||
        cancelResult.reservation_id !== id
      ) {
        return NextResponse.json(
          { ok: false, error: "予約取消結果を確認できませんでした" },
          { status: 409 }
        );
      }

      const delivery = await sendAdminLineMessage(
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
        ].join("\n"),
        createAdminLineRetryKey([
          "customer-requested-reservation-cancel",
          id,
          customerId,
          currentStatus,
          getString(reservation, ["start_at"]),
          getString(reservation, ["menu", "menu_name"]),
        ])
      );

      return NextResponse.json({
        ok: true,
        message: "予約希望を取り消しました",
        notificationWarning: getAdminLineWarning(delivery) || undefined,
        notificationStatus: delivery.status,
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
      const expectedRequestRevision = String(
        body.expectedRequestRevision || ""
      ).trim();
      const currentRequestRevision = createCustomerRequestRevision({
        reservation,
        customerId,
        customerName,
      });

      if (expectedRequestRevision !== currentRequestRevision) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "予約内容が更新されています。最新の内容を読み込み直してから依頼してください",
            retryable: false,
            deliveryStatus: "not_sent",
          },
          { status: 409 }
        );
      }

      const title =
        action === "request_cancel"
          ? "予約キャンセル希望が届きました"
          : "予約変更希望が届きました";

      const lineMessage = [
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
        ].join("\n");
      const lineRetryKey = createAdminLineRetryKey([
        "customer-confirmed-reservation-request",
        id,
        customerId,
        currentStatus,
        currentRequestRevision,
        action,
        requestMessage,
      ]);

      if (lineMessage.length > LINE_TEXT_MAX_CODE_UNITS) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "希望内容が長すぎます。内容を短くしてから再送してください",
            retryable: true,
            deliveryStatus: "not_sent",
          },
          { status: 400 }
        );
      }

      const delivery = await sendAdminLineMessage(
        lineMessage,
        lineRetryKey
      );

      if (!delivery.accepted) {
        const retryMessage =
          delivery.status === "unknown"
            ? "店舗LINEの応答を確認できませんでした。送信完了を確認できていません。同じ内容で再試行してください"
            : delivery.retryable
              ? "店舗へ通知できませんでした。同じ内容で再試行してください"
              : "店舗へ通知できませんでした。時間をおいて再試行するか、店舗へ直接ご連絡ください";

        return NextResponse.json(
          {
            ok: false,
            error: retryMessage,
            retryable: delivery.retryable,
            deliveryStatus: delivery.status,
          },
          { status: delivery.status === "not_configured" ? 503 : 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        message:
          delivery.alreadyAccepted
            ? "店舗への送信済み依頼を確認しました。重複送信していません"
            : action === "request_cancel"
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
    const durationMinutes = normalizeCustomerBookingDuration(
      body.durationMinutes
    );

    if (!date || !time || !menu) {
      return NextResponse.json(
        {
          ok: false,
          error: "日付・時間・メニューを入力してください",
        },
        { status: 400 }
      );
    }

    if (!isValidCustomerBookingDate(date)) {
      return NextResponse.json(
        {
          ok: false,
          error: "希望日を確認してください",
        },
        { status: 400 }
      );
    }

    if (durationMinutes === null) {
      return NextResponse.json(
        {
          ok: false,
          error: "所要時間を確認してください",
        },
        { status: 400 }
      );
    }

    const salonId = getString(reservation, ["salon_id"]);

    if (!salonId) {
      return NextResponse.json(
        {
          ok: false,
          error: "予約店舗を確認できません",
        },
        { status: 409 }
      );
    }

    const availability = await getCustomerReservationAvailability({
      supabase: supabaseAdmin,
      salonId,
      date,
      durationMinutes,
      excludeReservationId: id,
    });
    const selectedSlot = availability.slots.find(
      (slot) => slot.time === time
    );
    const availableStaffIds = selectedSlot?.staffIds || [];
    const assignedStaffId = staffId
      ? availableStaffIds.includes(staffId)
        ? staffId
        : null
      : availableStaffIds[0] || null;

    if (!assignedStaffId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "選択した時間の空き状況が変わりました。別の時間を選択してください",
        },
        { status: 409 }
      );
    }

    const startDate = new Date(`${date}T${time}:00+09:00`);
    const startIso = startDate.toISOString();
    const endIso = new Date(
      startDate.getTime() + durationMinutes * 60 * 1000
    ).toISOString();

    const previousStartAt = getString(reservation, ["start_at"]);
    const previousMenu =
      getString(reservation, ["menu", "menu_name"]) || "未設定";

    const { data: writeData, error: updateError } = await supabaseAdmin.rpc(
      "update_customer_requested_reservation",
      {
        p_reservation_id: id,
        p_customer_id: customerId,
        p_expected_start_at: previousStartAt || null,
        p_expected_end_at: getString(reservation, ["end_at"]) || null,
        p_staff_id: assignedStaffId,
        p_menu: menu,
        p_start_at: startIso,
        p_end_at: endIso,
        p_memo: memo,
      }
    );

    if (updateError) {
      throw new Error(updateError.message);
    }

    const writeResult = getReservationWriteRow(writeData);

    if (!writeResult) {
      throw new Error("予約更新結果を確認できませんでした");
    }

    if (
      writeResult.outcome === "stale" ||
      writeResult.outcome === "not_found"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "予約状態が更新されています。最新の内容を読み込み直してください",
        },
        { status: 409 }
      );
    }

    if (writeResult.outcome === "slot_unavailable") {
      return NextResponse.json(
        {
          ok: false,
          error: staffId
            ? "選択した担当者はその時間帯に既に予約があります"
            : "その時間帯には既に予約があります",
        },
        { status: 409 }
      );
    }

    if (writeResult.outcome === "invalid_staff") {
      return NextResponse.json(
        { ok: false, error: "選択した担当者は現在予約できません" },
        { status: 409 }
      );
    }

    if (writeResult.outcome !== "updated" || !writeResult.reservation_id) {
      return NextResponse.json(
        { ok: false, error: "予約内容を確認できませんでした" },
        { status: 409 }
      );
    }

    const delivery = await sendAdminLineMessage(
      [
        "💅 予約希望が変更されました",
        "",
        `お客様名：${customerName}`,
        `変更前日時：${formatDateTime(previousStartAt)}`,
        `変更後日時：${formatDateTime(startIso)}`,
        `変更前メニュー：${previousMenu}`,
        `変更後メニュー：${menu}`,
        `担当：${staffId ? "指名あり" : "指名なし（空き担当者へ割当）"}`,
        "",
        "備考：",
        memo || "-",
      ].join("\n"),
      createAdminLineRetryKey([
        "customer-requested-reservation-update",
        id,
        customerId,
        currentStatus,
        startIso,
        endIso,
        menu,
        assignedStaffId,
        memo,
      ])
    );

    return NextResponse.json({
      ok: true,
      message: "予約希望を変更しました",
      notificationWarning: getAdminLineWarning(delivery) || undefined,
      notificationStatus: delivery.status,
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
