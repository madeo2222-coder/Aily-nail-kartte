import { supabase } from "@/lib/supabase";

type MailSource = "hpb" | "minimo";

export type ParsedHpbMail = {
  source: MailSource;
  action: "reservation" | "cancel";
  reservationNumber: string;
  customerName: string;
  normalizedCustomerName: string;
  compareCustomerName: string;
  customerKana: string;
  compareCustomerKana: string;
  phone: string;
  startAt: string;
  endAt: string;
  menu: string;
  staffName: string;
  price: number | null;
};

type MatchedCustomer = {
  id: string;
  name: string | null;
  phone?: string | null;
};

type CustomerMatchResult = {
  customerId: string | null;
  matchStatus: string;
  matchedCount: number;
  matchedName: string | null;
  autoCreated?: boolean;
};

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function extractKanaFromName(value: string) {
  const match = value.match(/（([^）]+)）/) || value.match(/\(([^)]+)\)/);
  return match?.[1]?.trim() || "";
}

function normalizeCustomerName(value: string) {
  return value
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(value: string) {
  return value
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .replace(/　+/g, "")
    .trim();
}

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
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

  return new Date(
    Date.UTC(year, month - 1, day, hour - 9, minute, 0)
  ).toISOString();
}

function parseDurationMinutes(text: string) {
  const hpbMatch = text.match(/所要時間目安\s*[:：]\s*(\d+)時間(?:(\d+)分)?/);

  if (hpbMatch) {
    const hours = Number(hpbMatch[1] || 0);
    const minutes = Number(hpbMatch[2] || 0);
    const total = hours * 60 + minutes;
    if (total > 0) return total;
  }

  const hpbMinuteMatch = text.match(/所要時間目安\s*[:：]\s*(\d+)分/);
  if (hpbMinuteMatch) {
    const total = Number(hpbMinuteMatch[1]);
    if (total > 0) return total;
  }

  const minimoMatch = text.match(/施術時間\s*[:：]\s*(\d+)分/);
  if (minimoMatch) {
    const total = Number(minimoMatch[1]);
    if (total > 0) return total;
  }

  return 90;
}

function parsePrice(text: string) {
  const match = text.match(
    /(?:合計金額|予約時合計金額|金額|店頭お支払い金額)[^\d]*(\d[\d,]*)円/
  );

  if (!match?.[1]) return null;

  const price = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(price) ? price : null;
}

function parseMinimoDateTime(value: string) {
  return parseJapaneseDateTime(value);
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

  const phone = extractFirstMatch(text, [
    /■電話番号\s*\n\s*([0-9\-]+)/,
    /電話番号\s*\n\s*([0-9\-]+)/,
    /電話番号\s*[:：]?\s*([0-9\-]+)/,
  ]);

  const customerKana = extractKanaFromName(customerName);
  const normalizedCustomerName = normalizeCustomerName(customerName);
  const compareCustomerName = normalizeForCompare(normalizedCustomerName);
  const compareCustomerKana = normalizeForCompare(customerKana);

  const dateText = extractFirstMatch(text, [
    /■来店日時\s*\n\s*([^\n]+)/,
    /来店日時\s*\n\s*([^\n]+)/,
    /来店日時\s*[:：]?\s*([^\n]+)/,
  ]);

  const startAt = parseJapaneseDateTime(dateText);

  if (!reservationNumber) throw new Error("予約番号を解析できませんでした");
  if (!customerName) throw new Error("氏名を解析できませんでした");
  if (!startAt) throw new Error("来店日時を解析できませんでした");

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
    source: "hpb",
    action,
    reservationNumber,
    customerName,
    normalizedCustomerName,
    compareCustomerName,
    customerKana,
    compareCustomerKana,
    phone,
    startAt,
    endAt,
    menu: menu.trim(),
    staffName,
    price: parsePrice(text),
  };
}

function parseMinimoMail(rawText: string): ParsedHpbMail {
  const text = normalizeText(rawText);

  const action: ParsedHpbMail["action"] =
    text.includes("下記の予約がキャンセルされました") ||
    text.includes("キャンセル理由") ||
    text.includes("キャンセルされました") ||
    text.includes("予約がキャンセル") ||
    text.includes("キャンセルになりました")
      ? "cancel"
      : "reservation";

  const reservationNumber = extractFirstMatch(text, [
    /予約ID\s*\n\s*([^\n]+)/,
    /予約ID\s*[:：]?\s*([^\n]+)/,
  ]);

  const customerName = extractFirstMatch(text, [
    /氏名\s*\n\s*([^\n]+)/,
    /氏名\s*[:：]?\s*([^\n]+)/,
  ]);

  const phone = extractFirstMatch(text, [
    /電話番号\s*\n\s*([0-9\-]+)/,
    /電話番号\s*[:：]?\s*([0-9\-]+)/,
  ]);

  const dateText = extractFirstMatch(text, [
    /来店日時\s*\n\s*([^\n]+)/,
    /来店日時\s*[:：]?\s*([^\n]+)/,
  ]);

  const startAt = parseMinimoDateTime(dateText);

  if (!reservationNumber) throw new Error("ミニモ予約IDを解析できませんでした");
  if (!customerName) throw new Error("ミニモ氏名を解析できませんでした");
  if (!startAt) throw new Error("ミニモ来店日時を解析できませんでした");

  const durationMinutes = parseDurationMinutes(text);
  const startDate = new Date(startAt);
  const endAt = new Date(
    startDate.getTime() + durationMinutes * 60 * 1000
  ).toISOString();

  const staffName =
    extractFirstMatch(text, [
      /担当者\s*\n\s*([^\n]+)/,
      /担当者\s*[:：]?\s*([^\n]+)/,
    ]) || "指名なし";

  const menu =
    extractFirstMatch(text, [
      /メニュー\s*\n\s*([\s\S]*?)(?:\n・店頭お支払い金額|\n店頭お支払い金額|\n■|$)/,
      /メニュー\s*[:：]?\s*([\s\S]*?)(?:\n・店頭お支払い金額|\n店頭お支払い金額|\n■|$)/,
    ]) || "ミニモ予約";

  const normalizedCustomerName = normalizeCustomerName(customerName);
  const compareCustomerName = normalizeForCompare(normalizedCustomerName);

  return {
    source: "minimo",
    action,
    reservationNumber,
    customerName,
    normalizedCustomerName,
    compareCustomerName,
    customerKana: "",
    compareCustomerKana: "",
    phone,
    startAt,
    endAt,
    menu: menu.trim(),
    staffName,
    price: parsePrice(text),
  };
}

function parseReservationMail(rawText: string): ParsedHpbMail {
  const text = normalizeText(rawText);

  if (
    text.includes("ミニモ") ||
    text.includes("minimo") ||
    text.includes("ミニモサロンツール") ||
    text.includes("予約ID")
  ) {
    return parseMinimoMail(text);
  }

  return parseHpbMail(text);
}

async function getDefaultSalonId() {
  const { data, error } = await supabase
    .from("salons")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error) return null;

  return data?.id || null;
}

async function createCustomerFromReservation(
  parsed: ParsedHpbMail
): Promise<CustomerMatchResult> {
  const sourceLabel = getSourceLabel(parsed.source);
  const salonId = await getDefaultSalonId();

  const notes = [
    `${sourceLabel}予約メールから自動作成`,
    `${sourceLabel}予約番号/ID：${parsed.reservationNumber}`,
    parsed.price ? `${sourceLabel}金額：${parsed.price}円` : "",
    `${sourceLabel}担当：${parsed.staffName}`,
  ]
    .filter(Boolean)
    .join("\n");

  const payload: {
    name: string;
    phone?: string | null;
    name_kana?: string | null;
    notes?: string | null;
    salon_id?: string | null;
  } = {
    name: parsed.normalizedCustomerName || parsed.customerName,
    phone: parsed.phone || null,
    name_kana: parsed.customerKana || null,
    notes,
  };

  if (salonId) {
    payload.salon_id = salonId;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);

  return {
    customerId: data.id,
    matchStatus: "auto_created",
    matchedCount: 1,
    matchedName: data.name,
    autoCreated: true,
  };
}

async function findOrCreateCustomer(parsed: ParsedHpbMail) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone")
    .not("name", "is", null);

  if (error) throw new Error(error.message);

  const customers = (data || []) as MatchedCustomer[];

  const phoneCompare = normalizePhone(parsed.phone || "");

  if (phoneCompare) {
    const phoneMatches = customers.filter((customer) => {
      return normalizePhone(customer.phone || "") === phoneCompare;
    });

    if (phoneMatches.length === 1) {
      return {
        customerId: phoneMatches[0].id,
        matchStatus: "matched_by_phone",
        matchedCount: 1,
        matchedName: phoneMatches[0].name,
      };
    }
  }

  const nameMatches = customers.filter((customer) => {
    const compareName = normalizeForCompare(customer.name || "");
    return compareName === parsed.compareCustomerName;
  });

  if (nameMatches.length === 1) {
    return {
      customerId: nameMatches[0].id,
      matchStatus: "matched_by_name",
      matchedCount: 1,
      matchedName: nameMatches[0].name,
    };
  }

  if (parsed.compareCustomerKana) {
    const kanaMatches = customers.filter((customer) => {
      const compareName = normalizeForCompare(customer.name || "");
      return compareName.includes(parsed.compareCustomerKana);
    });

    if (kanaMatches.length === 1) {
      return {
        customerId: kanaMatches[0].id,
        matchStatus: "matched_by_kana",
        matchedCount: 1,
        matchedName: kanaMatches[0].name,
      };
    }

    if (kanaMatches.length > 1) {
      return {
        customerId: null,
        matchStatus: "multiple_found_by_kana",
        matchedCount: kanaMatches.length,
        matchedName: null,
      };
    }
  }

  if (parsed.action === "reservation") {
    return await createCustomerFromReservation(parsed);
  }

  return {
    customerId: null,
    matchStatus: "not_found",
    matchedCount: 0,
    matchedName: null,
  };
}

function getSourceLabel(source: MailSource) {
  return source === "minimo" ? "ミニモ" : "HPB";
}

function getReservationNumberMemoKey(source: MailSource) {
  return source === "minimo" ? "ミニモ予約ID" : "HPB予約番号";
}

async function upsertReservation(parsed: ParsedHpbMail, rawText: string) {
  const sourceLabel = getSourceLabel(parsed.source);
  const reservationKey = getReservationNumberMemoKey(parsed.source);
  const customerMatch = await findOrCreateCustomer(parsed);

  const { data: existing, error: findError } = await supabase
    .from("reservations")
    .select("id")
    .ilike("memo", `%${reservationKey}：${parsed.reservationNumber}%`)
    .maybeSingle();

  if (findError) throw new Error(findError.message);

  const memo = [
    `${reservationKey}：${parsed.reservationNumber}`,
    `${sourceLabel}氏名：${parsed.customerName}`,
    `${sourceLabel}氏名照合用：${parsed.normalizedCustomerName}`,
    `${sourceLabel}氏名比較用：${parsed.compareCustomerName}`,
    parsed.phone ? `${sourceLabel}電話番号：${parsed.phone}` : "",
    parsed.customerKana ? `${sourceLabel}カナ：${parsed.customerKana}` : "",
    parsed.compareCustomerKana
      ? `${sourceLabel}カナ比較用：${parsed.compareCustomerKana}`
      : "",
    `${sourceLabel}顧客照合：${customerMatch.matchStatus}（${customerMatch.matchedCount}件）`,
    customerMatch.matchedName
      ? `${sourceLabel}紐付け顧客：${customerMatch.matchedName}`
      : "",
    customerMatch.autoCreated ? `${sourceLabel}顧客自動作成：true` : "",
    `${sourceLabel}担当：${parsed.staffName}`,
    parsed.price ? `${sourceLabel}金額：${parsed.price}円` : "",
    "",
    `【${sourceLabel}メール本文】`,
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
  const sourceLabel = getSourceLabel(parsed.source);
  const reservationKey = getReservationNumberMemoKey(parsed.source);

  const { data: existing, error: findError } = await supabase
    .from("reservations")
    .select("id, memo")
    .ilike("memo", `%${reservationKey}：${parsed.reservationNumber}%`)
    .maybeSingle();

  if (findError) throw new Error(findError.message);

  if (!existing?.id) {
    return {
      mode: "cancel_missing",
      reservationId: null,
    };
  }

  const nextMemo = [
    existing.memo || "",
    "",
    `【${sourceLabel}キャンセルメール本文】`,
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

export async function syncHpbMailText(rawText: string) {
  const parsed = parseReservationMail(rawText);

  const result =
    parsed.action === "cancel"
      ? await cancelReservation(parsed, rawText)
      : await upsertReservation(parsed, rawText);

  return {
    parsed,
    result,
  };
}