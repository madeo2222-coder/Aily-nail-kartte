import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type ParsedHpbMail = {
  action: "reservation" | "cancel";
  reservationNumber: string;
  customerName: string;
  normalizedCustomerName: string;
  compareCustomerName: string;
  startAt: string;
  endAt: string;
  menu: string;
  staffName: string;
  price: number | null;
};

type MatchedCustomer = {
  id: string;
  name: string | null;
};

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeCustomerName(value: string) {
  return value
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCustomerNameForCompare(value: string) {
  return normalizeCustomerName(value)
    .replace(/\s+/g, "")
    .replace(/　+/g, "")
    .trim();
}

function extractFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

function parseJapaneseDateTime(value: string) {
  const match = value.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日.*?(\d{1,2}):(\d{2})/
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  return new Date(
    Date.UTC(year, month - 1, day, hour - 9, minute, 0)
  ).toISOString();
}

function parseDurationMinutes(text: string) {
  const match = text.match(/所要時間目安\s*[:：]\s*(\d+)時間(?:(\d+)分)?/);
  if (match) {
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const total = hours * 60 + minutes;
    if (total > 0) return total;
  }

  const minuteMatch = text.match(/所要時間目安\s*[:：]\s*(\d+)分/);
  if (minuteMatch) {
    const total = Number(minuteMatch[1]);
    if (total > 0) return total;
  }

  return 90;
}

function parsePrice(text: string) {
  const match = text.match(/(?:合計金額|予約時合計金額|金額)[^\d]*(\d[\d,]*)円/);
  if (!match?.[1]) return null;

  const price = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(price) ? price : null;
}

function parseHpbMail(rawText: string): ParsedHpbMail {
  const text = normalizeText(rawText);

  const action: ParsedHpbMail["action"] =
    text.includes("キャンセル連絡") ||
    text.includes("キャンセルがありました") ||
    text.includes("ご予約のキャンセル")
      ? "cancel"
      : "reservation";

  const reservationNumber = extractFirstMatch(text, [
    /予約番号\s*\n\s*([A-Z]{1,4}\d{6,})/,
    /予約番号\s*[:：]?\s*([A-Z]{1,4}\d{6,})/,
  ]);

  const customerName = extractFirstMatch(text, [
    /■氏名\s*\n\s*([^\n]+)/,
    /氏名\s*\n\s*([^\n]+)/,
    /氏名\s*[:：]?\s*([^\n]+)/,
  ]);

  const normalizedCustomerName = normalizeCustomerName(customerName);
  const compareCustomerName = normalizeCustomerNameForCompare(customerName);

  const dateText = extractFirstMatch(text, [
    /■来店日時\s*\n\s*([^\n]+)/,
    /来店日時\s*\n\s*([^\n]+)/,
    /来店日時\s*[:：]?\s*([^\n]+)/,
  ]);

  const startAt = parseJapaneseDateTime(dateText);

  if (!reservationNumber) {
    throw new Error("予約番号を解析できませんでした");
  }

  if (!customerName) {
    throw new Error("氏名を解析できませんでした");
  }

  if (!startAt) {
    throw new Error("来店日時を解析できませんでした");
  }

  const durationMinutes = parseDurationMinutes(text);
  const startDate = new Date(startAt);
  const endAt = new Date(
    startDate.getTime() + durationMinutes * 60 * 1000
  ).toISOString();

  const staffName =
    extractFirstMatch(text, [
      /■指名スタッフ\s*\n\s*([^\n]+)/,
      /指名スタッフ\s*\n\s*([^\n]+)/,
      /指名スタッフ\s*[:：]?\s*([^\n]+)/,
    ]) || "指名なし";

  const menu =
    extractFirstMatch(text, [
      /■メニュー\s*\n\s*([\s\S]*?)(?:\n■|\n□|$)/,
      /メニュー\s*\n\s*([\s\S]*?)(?:\n■|\n□|$)/,
    ]) || "HPB予約";

  return {
    action,
    reservationNumber,
    customerName,
    normalizedCustomerName,
    compareCustomerName,
    startAt,
    endAt,
    menu: menu.trim(),
    staffName,
    price: parsePrice(text),
  };
}

async function findCustomerByName(parsed: ParsedHpbMail) {
  if (!parsed.compareCustomerName) {
    return {
      customerId: null as string | null,
      matchStatus: "no_name",
      matchedCount: 0,
      matchedName: null as string | null,
    };
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .not("name", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const customers = (data || []) as MatchedCustomer[];

  const matchedCustomers = customers.filter((customer) => {
    const compareName = normalizeCustomerNameForCompare(customer.name || "");
    return compareName === parsed.compareCustomerName;
  });

  if (matchedCustomers.length === 1) {
    return {
      customerId: matchedCustomers[0].id,
      matchStatus: "matched",
      matchedCount: 1,
      matchedName: matchedCustomers[0].name,
    };
  }

  return {
    customerId: null as string | null,
    matchStatus:
      matchedCustomers.length === 0 ? "not_found" : "multiple_found",
    matchedCount: matchedCustomers.length,
    matchedName: null as string | null,
  };
}

async function upsertReservation(parsed: ParsedHpbMail, rawText: string) {
  const customerMatch = await findCustomerByName(parsed);

  const { data: existing, error: findError } = await supabase
    .from("reservations")
    .select("id, customer_id")
    .ilike("memo", `%HPB予約番号：${parsed.reservationNumber}%`)
    .maybeSingle();

  if (findError) {
    throw new Error(findError.message);
  }

  const memo = [
    `HPB予約番号：${parsed.reservationNumber}`,
    `HPB氏名：${parsed.customerName}`,
    `HPB氏名照合用：${parsed.normalizedCustomerName}`,
    `HPB氏名比較用：${parsed.compareCustomerName}`,
    `HPB顧客照合：${customerMatch.matchStatus}（${customerMatch.matchedCount}件）`,
    customerMatch.matchedName ? `HPB紐付け顧客：${customerMatch.matchedName}` : "",
    `HPB担当：${parsed.staffName}`,
    parsed.price ? `HPB金額：${parsed.price}円` : "",
    "",
    "【HPBメール本文】",
    rawText,
  ]
    .filter(Boolean)
    .join("\n");

  const reservationPayload: {
    menu: string;
    start_at: string;
    end_at: string;
    status: string;
    memo: string;
    customer_id?: string | null;
  } = {
    menu: parsed.menu,
    start_at: parsed.startAt,
    end_at: parsed.endAt,
    status: "confirmed",
    memo,
  };

  if (customerMatch.customerId) {
    reservationPayload.customer_id = customerMatch.customerId;
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("reservations")
      .update(reservationPayload)
      .eq("id", existing.id);

    if (error) throw new Error(error.message);

    return {
      mode: "updated",
      reservationId: existing.id,
      customerMatch,
    };
  }

  const { data, error } = await supabase
    .from("reservations")
    .insert(reservationPayload)
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return {
    mode: "inserted",
    reservationId: data.id,
    customerMatch,
  };
}

async function cancelReservation(parsed: ParsedHpbMail, rawText: string) {
  const { data: existing, error: findError } = await supabase
    .from("reservations")
    .select("id, memo")
    .ilike("memo", `%HPB予約番号：${parsed.reservationNumber}%`)
    .maybeSingle();

  if (findError) {
    throw new Error(findError.message);
  }

  if (!existing?.id) {
    return {
      mode: "cancel_missing",
      reservationId: null,
    };
  }

  const nextMemo = [
    existing.memo || "",
    "",
    "【HPBキャンセルメール本文】",
    rawText,
  ].join("\n");

  const { error } = await supabase
    .from("reservations")
    .update({
      status: "キャンセル",
      memo: nextMemo,
    })
    .eq("id", existing.id);

  if (error) throw new Error(error.message);

  return {
    mode: "cancelled",
    reservationId: existing.id,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawText = String(body.text || body.body || "").trim();

    if (!rawText) {
      return NextResponse.json(
        { ok: false, error: "メール本文が空です" },
        { status: 400 }
      );
    }

    const parsed = parseHpbMail(rawText);

    const result =
      parsed.action === "cancel"
        ? await cancelReservation(parsed, rawText)
        : await upsertReservation(parsed, rawText);

    return NextResponse.json({
      ok: true,
      parsed,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "HPBメール同期に失敗しました",
      },
      { status: 500 }
    );
  }
}