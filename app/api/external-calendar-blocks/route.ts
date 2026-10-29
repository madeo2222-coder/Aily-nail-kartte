import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";
import { isExternalBlockOperationId } from "@/lib/external-calendar-block-submission";

export const dynamic = "force-dynamic";

const CANCELLED_STATUSES = new Set([
  "キャンセル",
  "cancelled",
  "canceled",
  "rejected",
  "declined",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

type CreateBlockBody = {
  salonId?: unknown;
  staffId?: unknown;
  source?: unknown;
  title?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  memo?: unknown;
  operationId?: unknown;
};

type ExistingBlock = {
  id: string;
  salon_id: string;
  staff_id: string;
  source: string;
  title: string | null;
  start_at: string;
  end_at: string;
  memo: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase configuration is missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function internalErrorResponse() {
  return errorResponse(
    "外部予約ブロックを登録できませんでした。通信状況を確認して再試行してください。",
    500,
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function matchesSubmission(
  existing: ExistingBlock,
  payload: Record<string, string | null>,
) {
  return (
    existing.salon_id === payload.salon_id &&
    existing.staff_id === payload.staff_id &&
    existing.source === payload.source &&
    existing.title === payload.title &&
    new Date(existing.start_at).getTime() ===
      new Date(payload.start_at || "").getTime() &&
    new Date(existing.end_at).getTime() ===
      new Date(payload.end_at || "").getTime() &&
    existing.memo === payload.memo
  );
}

function buildJstDateTime(date: string, time: string) {
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return null;

  const dateOnly = new Date(`${date}T00:00:00Z`);
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isFinite(dateOnly.getTime()) ||
    dateOnly.toISOString().slice(0, 10) !== date ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const parsed = new Date(`${date}T${time}:00+09:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function authenticate() {
  return authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
}

export async function GET() {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  try {
    const supabase = getSupabaseAdmin();
    let staffsQuery = supabase
      .from("staffs")
      .select("id, name, salon_id")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (authentication.principal.authenticationMode === "supabase") {
      staffsQuery = staffsQuery.eq(
        "salon_id",
        authentication.principal.salonId,
      );
    }

    const staffsResult = await staffsQuery;

    if (staffsResult.error) {
      return errorResponse(
        "スタッフ情報を取得できませんでした。通信状況を確認して再試行してください。",
        500,
      );
    }

    return NextResponse.json({ ok: true, staffs: staffsResult.data || [] });
  } catch {
    return errorResponse(
      "スタッフ情報を取得できませんでした。通信状況を確認して再試行してください。",
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  const authentication = await authenticate();

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  let body: CreateBlockBody;

  try {
    body = (await request.json()) as CreateBlockBody;
  } catch {
    return errorResponse("入力内容を確認してください。", 400);
  }

  const requestedSalonId = cleanString(body.salonId);
  const staffId = cleanString(body.staffId);
  const source = cleanString(body.source) || "manual";
  const title = cleanString(body.title);
  const date = cleanString(body.date);
  const startTime = cleanString(body.startTime);
  const endTime = cleanString(body.endTime);
  const memo = cleanString(body.memo);
  const operationId = cleanString(body.operationId);
  const salonId =
    authentication.principal.authenticationMode === "supabase"
      ? authentication.principal.salonId
      : requestedSalonId;

  if (!validUuid(salonId) || !validUuid(staffId)) {
    return errorResponse("サロン・担当スタッフを確認してください。", 400);
  }

  if (operationId && !isExternalBlockOperationId(operationId)) {
    return errorResponse("外部予定の登録操作を確認できません。", 400);
  }

  if (
    authentication.principal.authenticationMode === "supabase" &&
    requestedSalonId &&
    requestedSalonId !== salonId
  ) {
    return errorResponse("所属サロン以外の予定は登録できません。", 403);
  }

  if (source.length > 100 || title.length > 500 || memo.length > 5_000) {
    return errorResponse("タイトルまたはメモの内容を確認してください。", 400);
  }

  const startAt = buildJstDateTime(date, startTime);
  const endAt = buildJstDateTime(date, endTime);
  const durationMinutes =
    startAt && endAt
      ? (endAt.getTime() - startAt.getTime()) / 60_000
      : Number.NaN;

  if (
    !startAt ||
    !endAt ||
    startTime < "10:00" ||
    endTime > "19:00" ||
    durationMinutes < 30 ||
    durationMinutes > 9 * 60
  ) {
    return errorResponse(
      "時間は10:00〜19:00の範囲で正しく入力してください。",
      400,
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const staffResult = await supabase
      .from("staffs")
      .select("id, salon_id, is_active")
      .eq("id", staffId)
      .eq("salon_id", salonId)
      .maybeSingle();

    if (staffResult.error) return internalErrorResponse();
    if (!staffResult.data || staffResult.data.is_active !== true) {
      return errorResponse("担当スタッフを確認してください。", 400);
    }

    const startIso = startAt.toISOString();
    const endIso = endAt.toISOString();
    const insertPayload: Record<string, string | null> = {
      salon_id: salonId,
      staff_id: staffId,
      source,
      title: title || null,
      start_at: startIso,
      end_at: endIso,
      memo: memo || null,
    };
    const readExistingOperation = async () => {
      if (!operationId) return null;

      const result = await supabase
        .from("external_calendar_blocks")
        .select(
          "id, salon_id, staff_id, source, title, start_at, end_at, memo",
        )
        .eq("id", operationId)
        .eq("salon_id", salonId)
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      return (result.data || null) as ExistingBlock | null;
    };

    const existingOperation = await readExistingOperation();
    if (existingOperation) {
      if (!matchesSubmission(existingOperation, insertPayload)) {
        return errorResponse("外部予定の登録操作の内容が一致しません。", 409);
      }
      return NextResponse.json({
        ok: true,
        id: existingOperation.id,
        replayed: true,
      });
    }

    const [reservationsResult, blocksResult] = await Promise.all([
      supabase
        .from("reservations")
        .select("id, status, staff_id")
        .eq("salon_id", salonId)
        .lt("start_at", endIso)
        .gt("end_at", startIso),
      supabase
        .from("external_calendar_blocks")
        .select("id, staff_id")
        .eq("salon_id", salonId)
        .lt("start_at", endIso)
        .gt("end_at", startIso),
    ]);

    if (reservationsResult.error || blocksResult.error) {
      return internalErrorResponse();
    }

    const reservationOverlap = (reservationsResult.data || []).some(
      (reservation) =>
        (reservation.staff_id === null || reservation.staff_id === staffId) &&
        !CANCELLED_STATUSES.has(reservation.status || ""),
    );
    const blockOverlap = (blocksResult.data || []).some(
      (block) => block.staff_id === null || block.staff_id === staffId,
    );

    if (reservationOverlap || blockOverlap) {
      return errorResponse(
        "この時間帯はすでに予約またはブロックがあります。カレンダーで確認してください。",
        409,
      );
    }

    if (operationId) insertPayload.id = operationId;
    const insertResult = await supabase
      .from("external_calendar_blocks")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertResult.error || !insertResult.data?.id) {
      const reconciled = await readExistingOperation();
      if (reconciled && matchesSubmission(reconciled, insertPayload)) {
        return NextResponse.json({
          ok: true,
          id: reconciled.id,
          replayed: true,
        });
      }
      return internalErrorResponse();
    }

    return NextResponse.json({ ok: true, id: insertResult.data.id });
  } catch {
    return internalErrorResponse();
  }
}
