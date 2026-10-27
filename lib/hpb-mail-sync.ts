import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  appendExternalCancellationMemo,
  buildManualReservationLookupWindow,
  buildExternalCustomerId,
  buildExternalReservationId,
  findExternalReservationCandidate,
  findManualReservationCandidate,
  hasSyncedMailBody,
  isCancelledReservationStatus,
  normalizeExternalReservationNumber,
  readSyncedManualMemo,
  type MailSyncSource,
} from "@/lib/hpb-mail-sync-reconciliation";
import { isProgressedReservationStatus } from "@/lib/reservation-status";

type MailSource = MailSyncSource;

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

function isStableCancellationCustomerMatch(
  match: CustomerMatchResult | null
) {
  return (
    match?.matchStatus === "matched_by_phone" ||
    match?.matchStatus === "matched_by_external_id"
  );
}

type SyncContext = {
  supabase: SupabaseClient;
  salonId: string;
  staffId: string | null;
};

type ExistingReservation = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  memo: string | null;
  status: string | null;
  start_at: string | null;
  end_at: string | null;
};

const CUSTOMER_LOOKUP_PAGE_SIZE = 1000;
const EXTERNAL_RESERVATION_LOOKUP_PAGE_SIZE = 1000;
const MAX_RESERVATION_DURATION_MINUTES = 24 * 60;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase管理接続の環境変数が不足しています");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeProviderText(value: string) {
  // Forwarding and copy/paste can turn provider identifiers and numeric
  // fields into full-width characters. Normalize only the text used for
  // structured parsing; callers still keep the original mail body in memo.
  return normalizeText(value).normalize("NFKC");
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
  const digits = value.replace(/[^\d]/g, "");

  // Treat Japanese numbers saved in international notation as the same
  // number carried by domestic booking mail. Some contact books retain the
  // trunk prefix as "+81 (0)...", while others omit it as "+81 ...".
  if (/^810\d{9,10}$/.test(digits)) return digits.slice(2);
  if (/^81\d{9,10}$/.test(digits)) return `0${digits.slice(2)}`;

  return digits;
}

function extractPhone(text: string, allowInvalid = false) {
  const rawPhone = extractFirstMatch(text, [
    /■電話番号[^\S\r\n]*[:：]?[^\S\r\n]*\n[^\S\r\n]*([^\r\n]+)/,
    /電話番号[^\S\r\n]*[:：]?[^\S\r\n]*\n[^\S\r\n]*([^\r\n]+)/,
    /電話番号[^\S\r\n]*[:：][^\S\r\n]*([^\r\n]+)/,
    /電話番号[^\S\r\n]+([^\r\n]+)/,
  ]);

  if (!rawPhone) return "";

  const phone = rawPhone.normalize("NFKC").trim();
  const digits = phone.replace(/[^\d]/g, "");

  // Accept common Japanese domestic/international formatting while rejecting
  // labels, extensions or damaged mail content before customer matching. A
  // partial value such as only "090" could otherwise miss the existing
  // customer and create a duplicate external customer.
  if (
    !/^\+?[\d][\d\s().\-‐‑‒–—ー]*$/.test(phone) ||
    digits.length < 10 ||
    digits.length > 13
  ) {
    if (allowInvalid) return "";
    throw new Error("電話番号を解析できませんでした");
  }

  return phone;
}

function isSameReservationDateTime(
  previous: string | null | undefined,
  current: string | null | undefined
) {
  if (previous == null || current == null) return previous == current;

  const previousTime = Date.parse(previous);
  const currentTime = Date.parse(current);
  if (Number.isFinite(previousTime) && Number.isFinite(currentTime)) {
    return previousTime === currentTime;
  }

  return previous === current;
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
    year < 1000 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const utcTime = Date.UTC(year, month - 1, day, hour - 9, minute, 0);
  if (!Number.isFinite(utcTime)) return null;

  // Date.UTC normalizes impossible dates (for example, February 30) into a
  // different day. Round-trip the parsed values in JST so malformed provider
  // mail cannot silently create or update a reservation at the wrong time.
  const jstTime = new Date(utcTime + 9 * 60 * 60 * 1000);
  if (
    jstTime.getUTCFullYear() !== year ||
    jstTime.getUTCMonth() + 1 !== month ||
    jstTime.getUTCDate() !== day ||
    jstTime.getUTCHours() !== hour ||
    jstTime.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return new Date(utcTime).toISOString();
}

function parseDurationMinutes(text: string, allowInvalid = false) {
  const hourMatch = text.match(
    /(?:所要時間目安|施術時間)\s*[:：]\s*(\d+)時間(?:(\d+)分)?/
  );

  if (hourMatch) {
    const hours = Number(hourMatch[1] || 0);
    const minutes = Number(hourMatch[2] || 0);
    const total = hours * 60 + minutes;
    if (
      minutes < 60 &&
      total > 0 &&
      total <= MAX_RESERVATION_DURATION_MINUTES
    ) {
      return total;
    }

    if (allowInvalid) return null;
    throw new Error("予約所要時間を解析できませんでした");
  }

  const minuteMatch = text.match(
    /(?:所要時間目安|施術時間)\s*[:：]\s*(\d+)分/
  );
  if (minuteMatch) {
    const total = Number(minuteMatch[1]);
    if (total > 0 && total <= MAX_RESERVATION_DURATION_MINUTES) return total;

    if (allowInvalid) return null;
    throw new Error("予約所要時間を解析できませんでした");
  }

  if (/(?:所要時間目安|施術時間)\s*[:：]/.test(text)) {
    if (allowInvalid) return null;
    throw new Error("予約所要時間を解析できませんでした");
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

function isCancellationSubject(subject: string) {
  const normalized = subject.normalize("NFKC").toLowerCase();
  return normalized.includes("キャンセル") || normalized.includes("cancel");
}

function parseHpbMail(
  rawText: string,
  mailSubject = ""
): ParsedHpbMail {
  const text = normalizeProviderText(rawText);

  const action: ParsedHpbMail["action"] =
    isCancellationSubject(mailSubject) ||
    text.includes("キャンセル連絡") ||
    text.includes("キャンセルがありました") ||
    text.includes("ご予約のキャンセル")
      ? "cancel"
      : "reservation";

  const reservationNumber = extractFirstMatch(text, [
    /予約番号\s*\n\s*([A-Z]{1,4}\d{6,})/i,
    /予約番号\s*[:：]?\s*([A-Z]{1,4}\d{6,})/i,
  ]).toUpperCase();

  const customerName = extractFirstMatch(text, [
    /■氏名\s*\n\s*([^\n]+)/,
    /氏名\s*\n\s*([^\n]+)/,
    /氏名\s*[:：]?\s*([^\n]+)/,
  ]);

  // An existing reservation can be cancelled safely by its external ID even
  // when optional customer details in the cancellation mail are masked or
  // malformed. New bookings keep strict validation before any database read.
  const phone = extractPhone(text, action === "cancel");

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
  if (action === "reservation" && !customerName) {
    throw new Error("氏名を解析できませんでした");
  }
  if (action === "reservation" && !startAt) {
    throw new Error("来店日時を解析できませんでした");
  }

  const durationMinutes = parseDurationMinutes(text, action === "cancel");
  const endAt = startAt && durationMinutes != null
    ? new Date(
        new Date(startAt).getTime() + durationMinutes * 60 * 1000
      ).toISOString()
    : "";

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
    startAt: startAt || "",
    endAt,
    menu: menu.trim(),
    staffName,
    price: parsePrice(text),
  };
}

function parseMinimoMail(
  rawText: string,
  mailSubject = ""
): ParsedHpbMail {
  const text = normalizeProviderText(rawText);

  const action: ParsedHpbMail["action"] =
    isCancellationSubject(mailSubject) ||
    text.includes("下記の予約がキャンセルされました") ||
    text.includes("キャンセル理由") ||
    text.includes("キャンセルされました") ||
    text.includes("予約がキャンセル") ||
    text.includes("キャンセルになりました")
      ? "cancel"
      : "reservation";

  const reservationNumber = normalizeExternalReservationNumber(
    extractFirstMatch(text, [
      /予約ID\s*\n\s*([^\n]+)/,
      /予約ID\s*[:：]?\s*([^\n]+)/,
    ])
  );

  const customerName = extractFirstMatch(text, [
    /氏名\s*\n\s*([^\n]+)/,
    /氏名\s*[:：]?\s*([^\n]+)/,
  ]);

  const phone = extractPhone(text, action === "cancel");

  const dateText = extractFirstMatch(text, [
    /来店日時\s*\n\s*([^\n]+)/,
    /来店日時\s*[:：]?\s*([^\n]+)/,
  ]);

  const startAt = parseMinimoDateTime(dateText);

  if (!reservationNumber) throw new Error("ミニモ予約IDを解析できませんでした");
  if (action === "reservation" && !customerName) {
    throw new Error("ミニモ氏名を解析できませんでした");
  }
  if (action === "reservation" && !startAt) {
    throw new Error("ミニモ来店日時を解析できませんでした");
  }

  const durationMinutes = parseDurationMinutes(text, action === "cancel");
  const endAt = startAt && durationMinutes != null
    ? new Date(
        new Date(startAt).getTime() + durationMinutes * 60 * 1000
      ).toISOString()
    : "";

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
    startAt: startAt || "",
    endAt,
    menu: menu.trim(),
    staffName,
    price: parsePrice(text),
  };
}

function parseReservationMail(
  rawText: string,
  mailSubject = ""
): ParsedHpbMail {
  const text = normalizeProviderText(rawText);
  const sourceText = `${normalizeProviderText(mailSubject)}\n${text}`;
  const normalizedSourceText = sourceText.toLowerCase();

  if (
    sourceText.includes("ミニモ") ||
    normalizedSourceText.includes("minimo") ||
    sourceText.includes("ミニモサロンツール") ||
    sourceText.includes("予約ID")
  ) {
    return parseMinimoMail(text, mailSubject);
  }

  return parseHpbMail(text, mailSubject);
}

export function parseHpbMailText(rawText: string, mailSubject = "") {
  return parseReservationMail(rawText, mailSubject);
}

async function resolveSyncContext(): Promise<SyncContext> {
  const supabase = getSupabaseAdmin();
  const { data: salons, error: salonError } = await supabase
    .from("salons")
    .select("id")
    .limit(2);

  if (salonError) throw new Error(salonError.message);
  if (!salons || salons.length !== 1) {
    throw new Error(
      "同期先サロンを一意に決められません。重複登録を避けるため同期を停止しました。"
    );
  }

  const salonId = salons[0].id;

  return { supabase, salonId, staffId: null };
}

async function resolveStaffId(
  parsed: ParsedHpbMail,
  context: SyncContext,
  { allowUnresolved = false }: { allowUnresolved?: boolean } = {}
): Promise<string | null> {
  let staffId: string | null = null;

  if (normalizeForCompare(parsed.staffName) !== normalizeForCompare("指名なし")) {
    const { data: staffs, error: staffError } = await context.supabase
      .from("staffs")
      .select("id, name")
      .eq("salon_id", context.salonId)
      .eq("is_active", true);

    if (staffError) throw new Error(staffError.message);

    const matches = (staffs || []).filter(
      (staff) =>
        normalizeForCompare(staff.name || "") ===
        normalizeForCompare(parsed.staffName)
    );

    if (matches.length > 1) {
      if (allowUnresolved) return null;
      throw new Error(
        `担当「${parsed.staffName}」が複数見つかりました。重複登録を避けるため同期を停止しました。`
      );
    }

    if (matches.length === 0) {
      if (allowUnresolved) return null;
      throw new Error(
        `担当「${parsed.staffName}」を特定できません。担当なしで重複登録することを避けるため同期を停止しました。`
      );
    }

    staffId = matches[0]?.id || null;
  }

  return staffId;
}

async function createCustomerFromReservation(
  parsed: ParsedHpbMail,
  context: SyncContext
): Promise<CustomerMatchResult> {
  const sourceLabel = getSourceLabel(parsed.source);

  const notes = [
    `${sourceLabel}予約メールから自動作成`,
    `${sourceLabel}予約番号/ID：${parsed.reservationNumber}`,
    parsed.price ? `${sourceLabel}金額：${parsed.price}円` : "",
    `${sourceLabel}担当：${parsed.staffName}`,
  ]
    .filter(Boolean)
    .join("\n");

  const payload: {
    id: string;
    name: string;
    phone?: string | null;
    name_kana?: string | null;
    notes?: string | null;
    salon_id: string;
  } = {
    id: buildExternalCustomerId(parsed.source, parsed.reservationNumber),
    name: parsed.normalizedCustomerName || parsed.customerName,
    phone: parsed.phone || null,
    name_kana: parsed.customerKana || null,
    notes,
    salon_id: context.salonId,
  };

  const { data, error } = await context.supabase
    .from("customers")
    .insert(payload)
    .select("id, name, salon_id")
    .single();

  if (error?.code === "23505") {
    const concurrentCustomer = await findExistingExternalCustomer(
      parsed,
      context
    );
    if (!concurrentCustomer) {
      throw new Error(
        "同時作成された顧客を確認できません。顧客一覧を確認してから再試行してください。"
      );
    }

    return {
      customerId: concurrentCustomer.id,
      matchStatus: "matched_by_external_id",
      matchedCount: 1,
      matchedName: concurrentCustomer.name || null,
    };
  }

  if (error) throw new Error(error.message);
  if (data?.id !== payload.id || data.salon_id !== context.salonId) {
    throw new Error(
      "顧客の保存結果を確認できません。顧客一覧を確認してから再試行してください。"
    );
  }

  return {
    customerId: data.id,
    matchStatus: "auto_created",
    matchedCount: 1,
    matchedName: data.name,
    autoCreated: true,
  };
}

async function findExistingExternalCustomer(
  parsed: ParsedHpbMail,
  context: SyncContext
) {
  const customerId = buildExternalCustomerId(
    parsed.source,
    parsed.reservationNumber
  );
  const { data, error } = await context.supabase
    .from("customers")
    .select("id, salon_id, name")
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) return null;
  if (data.id !== customerId) {
    throw new Error(
      "外部予約顧客の確認結果が一致しません。誤更新を避けるため同期を停止しました。"
    );
  }
  if (data.salon_id !== context.salonId) {
    throw new Error(
      "同じ外部予約番号の顧客が別サロンにあります。誤更新を避けるため同期を停止しました。"
    );
  }

  return data as { id: string; salon_id: string; name: string | null };
}

async function preserveExistingReservationCustomer(
  existing: ExistingReservation,
  context: SyncContext
): Promise<CustomerMatchResult | null> {
  if (!existing.customer_id) return null;

  const { data, error } = await context.supabase
    .from("customers")
    .select("id, salon_id, name")
    .eq("id", existing.customer_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) {
    throw new Error(
      "既存予約に紐づく顧客を確認できません。顧客一覧を確認してから再試行してください。"
    );
  }
  if (data.id !== existing.customer_id || data.salon_id !== context.salonId) {
    throw new Error(
      "既存予約の顧客が別サロンにあります。誤更新を避けるため同期を停止しました。"
    );
  }

  return {
    customerId: data.id,
    matchStatus: "preserved_existing_reservation_customer",
    matchedCount: 1,
    matchedName: data.name || null,
  };
}

async function findOrCreateCustomer(
  parsed: ParsedHpbMail,
  context: SyncContext
) {
  const existingExternalCustomer = await findExistingExternalCustomer(
    parsed,
    context
  );
  if (existingExternalCustomer) {
    return {
      customerId: existingExternalCustomer.id,
      matchStatus: "matched_by_external_id",
      matchedCount: 1,
      matchedName: existingExternalCustomer.name || null,
    };
  }

  const customers: MatchedCustomer[] = [];
  for (let offset = 0; ; offset += CUSTOMER_LOOKUP_PAGE_SIZE) {
    const { data, error } = await context.supabase
      .from("customers")
      .select("id, name, phone")
      .eq("salon_id", context.salonId)
      .not("name", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + CUSTOMER_LOOKUP_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data || []) as MatchedCustomer[];
    customers.push(...page);
    if (page.length < CUSTOMER_LOOKUP_PAGE_SIZE) break;
  }

  const phoneCompare = normalizePhone(parsed.phone || "");

  const hasCompatiblePhone = (customer: MatchedCustomer) => {
    if (!phoneCompare) return true;

    const customerPhone = normalizePhone(customer.phone || "");
    return !customerPhone || customerPhone === phoneCompare;
  };

  const phoneMatches = phoneCompare
    ? customers.filter((customer) => {
        return normalizePhone(customer.phone || "") === phoneCompare;
      })
    : [];

  if (phoneCompare) {
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
    return (
      compareName === parsed.compareCustomerName && hasCompatiblePhone(customer)
    );
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
      return (
        compareName.includes(parsed.compareCustomerKana) &&
        hasCompatiblePhone(customer)
      );
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

  if (phoneMatches.length > 1) {
    return {
      customerId: null,
      matchStatus: "multiple_found_by_phone",
      matchedCount: phoneMatches.length,
      matchedName: null,
    };
  }

  if (nameMatches.length > 1) {
    return {
      customerId: null,
      matchStatus: "multiple_found_by_name",
      matchedCount: nameMatches.length,
      matchedName: null,
    };
  }

  if (parsed.action === "reservation") {
    return await createCustomerFromReservation(parsed, context);
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

function getReservationMemoLookupMarker(source: MailSource) {
  // Keep the database filter broad enough to include legacy punctuation and
  // width variants, including a full-width HPB prefix. The exact normalized
  // key and reservation number are still matched line-by-line after every
  // candidate page has been read.
  return source === "minimo" ? "ミニモ予約" : "予約番号";
}

async function findExistingExternalReservation(
  parsed: ParsedHpbMail,
  context: SyncContext
) {
  const reservationLookupMarker = getReservationMemoLookupMarker(parsed.source);
  const candidates: ExistingReservation[] = [];

  // Older parser versions could save a lowercase or full-width minimo ID.
  // Fetch source-keyed rows and compare the exact normalized marker locally
  // so a replay updates the existing reservation instead of inserting a
  // second deterministic row under the newly canonicalized ID. Page through
  // every match because PostgREST commonly limits one response to 1,000 rows;
  // silently checking only the first page could create a duplicate later.
  for (
    let offset = 0;
    ;
    offset += EXTERNAL_RESERVATION_LOOKUP_PAGE_SIZE
  ) {
    const { data, error } = await context.supabase
      .from("reservations")
      .select("id, salon_id, customer_id, staff_id, menu, memo, status, start_at, end_at")
      .ilike("memo", `%${reservationLookupMarker}%`)
      .order("id", { ascending: true })
      .range(
        offset,
        offset + EXTERNAL_RESERVATION_LOOKUP_PAGE_SIZE - 1
      );

    if (error) throw new Error(error.message);

    const page = (data || []) as ExistingReservation[];
    candidates.push(...page);
    if (page.length < EXTERNAL_RESERVATION_LOOKUP_PAGE_SIZE) break;
  }

  const existing = findExternalReservationCandidate({
    candidates,
    source: parsed.source,
    reservationNumber: parsed.reservationNumber,
  });

  if (existing?.id && existing.salon_id !== context.salonId) {
    throw new Error(
      "同じ外部予約番号が別サロンにあります。誤更新を避けるため同期を停止しました。"
    );
  }

  return existing;
}

async function readReservationById(
  reservationId: string,
  context: SyncContext
) {
  const { data, error } = await context.supabase
    .from("reservations")
    .select("id, salon_id, customer_id, staff_id, menu, memo, status, start_at, end_at")
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) {
    throw new Error(
      "同時に変更された予約を確認できません。予約一覧を確認してから再試行してください。"
    );
  }
  if (data.salon_id !== context.salonId) {
    throw new Error(
      "同じ外部予約番号が別サロンにあります。誤更新を避けるため同期を停止しました。"
    );
  }

  return data as ExistingReservation;
}

async function findDelayedManualEntry(
  parsed: ParsedHpbMail,
  context: SyncContext,
  customerId: string | null = null
) {
  const lookupWindow = buildManualReservationLookupWindow(parsed.startAt);
  const { data, error } = await context.supabase
    .from("reservations")
    .select("id, customer_id, staff_id, menu, memo, status, start_at, end_at")
    .eq("salon_id", context.salonId)
    .gte("start_at", lookupWindow.from)
    .lte("start_at", lookupWindow.to);

  if (error) throw new Error(error.message);

  return findManualReservationCandidate({
    candidates: data || [],
    source: parsed.source,
    staffId: context.staffId,
    customerId,
  });
}

function buildReconciledCancellationMemo({
  existingMemo,
  parsed,
  customerMatch,
  sourceLabel,
  reservationKey,
  rawText,
}: {
  existingMemo: string | null | undefined;
  parsed: ParsedHpbMail;
  customerMatch: CustomerMatchResult;
  sourceLabel: string;
  reservationKey: string;
  rawText: string;
}) {
  const alreadyLinked = findExternalReservationCandidate({
    candidates: [{ memo: existingMemo || null }],
    source: parsed.source,
    reservationNumber: parsed.reservationNumber,
  });

  const linkedMemo = alreadyLinked
    ? existingMemo
    : [
        `${reservationKey}：${parsed.reservationNumber}`,
        `${sourceLabel}氏名：${parsed.customerName}`,
        parsed.phone ? `${sourceLabel}電話番号：${parsed.phone}` : "",
        `${sourceLabel}顧客照合：${customerMatch.matchStatus}（${customerMatch.matchedCount}件）`,
        customerMatch.matchedName
          ? `${sourceLabel}紐付け顧客：${customerMatch.matchedName}`
          : "",
        `${sourceLabel}担当：${parsed.staffName}`,
        `${sourceLabel}手入力予約を同期済み：true`,
        existingMemo?.trim() ? "【同期前の手入力メモ】" : "",
        existingMemo?.trim() || "",
      ]
        .filter(Boolean)
        .join("\n");

  return appendExternalCancellationMemo({
    existingMemo: linkedMemo,
    sourceLabel,
    rawText,
  });
}

async function upsertReservation(
  parsed: ParsedHpbMail,
  rawText: string,
  context: SyncContext
) {
  const sourceLabel = getSourceLabel(parsed.source);
  const reservationKey = getReservationNumberMemoKey(parsed.source);
  const existing = await findExistingExternalReservation(parsed, context);
  // Gmail replays earlier booking mails on every sync. A known cancellation
  // must survive even when its later cancellation mail cannot be fetched.
  if (existing && isCancelledReservationStatus(existing.status)) {
    return {
      mode: "cancelled",
      reservationId: existing.id,
      alreadyCancelled: true,
    };
  }
  // Gmail searches the last 30 days on every run. Replaying the exact mail
  // must not rewrite staff corrections made after its first successful sync.
  // A changed booking mail has a different body and continues through the
  // normal reconciliation path; cancellation mail uses the separate path.
  if (
    existing &&
    hasSyncedMailBody({
      memo: existing.memo,
      sourceLabel,
      rawText,
    })
  ) {
    return {
      mode: "updated",
      reservationId: existing.id,
      alreadySynced: true,
    };
  }
  // A provider booking normally carries a customer phone number. Without it,
  // a new external ID cannot be tied safely to an existing customer: a
  // same-name match may be a different person, and creating another customer
  // would leave no stable contact key. Existing external reservations remain
  // compatible because their already-reviewed customer link is preserved.
  if (!existing && parsed.action === "reservation" && !parsed.phone) {
    throw new Error(
      "電話番号がない新規予約メールは顧客を安全に特定できないため、予約保存を停止しました。"
    );
  }
  context.staffId = await resolveStaffId(parsed, context);
  const preservedExistingCustomer = existing
    ? await preserveExistingReservationCustomer(existing, context)
    : null;
  const customerMatch =
    preservedExistingCustomer || (await findOrCreateCustomer(parsed, context));
  if (parsed.action === "reservation" && !customerMatch.customerId) {
    throw new Error(
      `顧客候補を一意に特定できません（${customerMatch.matchStatus}: ${customerMatch.matchedCount}件）。誤紐付けを避けるため予約保存を停止しました。`
    );
  }
  if (
    existing?.customer_id &&
    customerMatch.customerId &&
    existing.customer_id !== customerMatch.customerId
  ) {
    throw new Error(
      "既存予約の顧客紐付けとメールの顧客照合結果が一致しません。誤更新を避けるため同期を停止しました。"
    );
  }
  const delayedManualEntry =
    existing || !customerMatch.customerId
      ? null
      : await findDelayedManualEntry(
          parsed,
          context,
          customerMatch.customerId
        );
  const preservedManualMemo = delayedManualEntry
    ? delayedManualEntry.memo?.trim() || ""
    : readSyncedManualMemo(existing?.memo, sourceLabel);

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
    delayedManualEntry || preservedManualMemo ? `${sourceLabel}手入力予約を同期済み：true` : "",
    preservedManualMemo ? "【同期前の手入力メモ】" : "",
    preservedManualMemo,
    "",
    `【${sourceLabel}メール本文】`,
    rawText,
  ]
    .filter(Boolean)
    .join("\n");

  const reservationToUpdate = existing || delayedManualEntry;
  const synchronizedStatus = isProgressedReservationStatus(
    reservationToUpdate?.status
  )
    ? reservationToUpdate!.status!
    : "confirmed";

  const reservationPayload: {
    salon_id: string;
    menu: string;
    start_at: string;
    end_at: string;
    status: string;
    memo: string;
    customer_id?: string | null;
    staff_id?: string | null;
  } = {
    salon_id: context.salonId,
    menu: parsed.menu,
    start_at: parsed.startAt,
    end_at: parsed.endAt,
    status: synchronizedStatus,
    memo,
  };

  if (customerMatch.customerId) {
    reservationPayload.customer_id = customerMatch.customerId;
  }

  if (context.staffId) {
    reservationPayload.staff_id = context.staffId;
  }

  if (reservationToUpdate?.id) {
    let updateQuery = context.supabase
      .from("reservations")
      .update(reservationPayload)
      .eq("id", reservationToUpdate.id)
      .eq("salon_id", context.salonId);
    updateQuery = reservationToUpdate.status == null
      ? updateQuery.is("status", null)
      : updateQuery.eq("status", reservationToUpdate.status);
    updateQuery = reservationToUpdate.memo == null
      ? updateQuery.is("memo", null)
      : updateQuery.eq("memo", reservationToUpdate.memo);
    updateQuery = reservationToUpdate.start_at == null
      ? updateQuery.is("start_at", null)
      : updateQuery.eq("start_at", reservationToUpdate.start_at);
    updateQuery = reservationToUpdate.end_at == null
      ? updateQuery.is("end_at", null)
      : updateQuery.eq("end_at", reservationToUpdate.end_at);
    updateQuery = reservationToUpdate.customer_id == null
      ? updateQuery.is("customer_id", null)
      : updateQuery.eq("customer_id", reservationToUpdate.customer_id);
    updateQuery = reservationToUpdate.staff_id == null
      ? updateQuery.is("staff_id", null)
      : updateQuery.eq("staff_id", reservationToUpdate.staff_id);
    updateQuery = reservationToUpdate.menu == null
      ? updateQuery.is("menu", null)
      : updateQuery.eq("menu", reservationToUpdate.menu);
    const { data, error } = await updateQuery
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data?.id !== reservationToUpdate.id) {
      const latest = await readReservationById(
        reservationToUpdate.id,
        context
      );
      if (isCancelledReservationStatus(latest.status)) {
        return {
          mode: "cancelled",
          reservationId: latest.id,
          alreadyCancelled: true,
        };
      }
      if (latest.status !== reservationToUpdate.status) {
        throw new Error(
          "同期中に予約状態が変更されました。最新状態を確認して再試行してください。"
        );
      }
      if (latest.memo !== reservationToUpdate.memo) {
        throw new Error(
          "同期中に予約メモが変更されました。スタッフの追記を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (latest.customer_id !== reservationToUpdate.customer_id) {
        throw new Error(
          "同期中に顧客紐付けが変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (latest.staff_id !== reservationToUpdate.staff_id) {
        throw new Error(
          "同期中に担当スタッフが変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (latest.menu !== reservationToUpdate.menu) {
        throw new Error(
          "同期中にメニューが変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (
        !isSameReservationDateTime(
          reservationToUpdate.start_at,
          latest.start_at
        ) ||
        !isSameReservationDateTime(
          reservationToUpdate.end_at,
          latest.end_at
        )
      ) {
        throw new Error(
          "同期中に予約日時が変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      throw new Error(
        "予約の更新結果を確認できません。予約一覧を確認してから再試行してください。"
      );
    }

    return {
      mode: "updated",
      reservationId: reservationToUpdate.id,
      customerMatch,
      reconciledManualEntry: Boolean(delayedManualEntry),
    };
  }

  const deterministicId = buildExternalReservationId(
    parsed.source,
    parsed.reservationNumber
  );
  const { data, error } = await context.supabase
    .from("reservations")
    .insert({
      id: deterministicId,
      ...reservationPayload,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const concurrentReservation = await readReservationById(
      deterministicId,
      context
    );

    if (isCancelledReservationStatus(concurrentReservation.status)) {
      return {
        mode: "cancelled",
        reservationId: concurrentReservation.id,
        alreadyCancelled: true,
      };
    }
    // Another sync may have inserted this exact mail while this request was
    // resolving the customer. Treat that winner as the completed write. A
    // follow-up UPDATE would be unnecessary and could overwrite staff edits
    // made immediately after the winning INSERT.
    if (
      hasSyncedMailBody({
        memo: concurrentReservation.memo,
        sourceLabel,
        rawText,
      })
    ) {
      return {
        mode: "updated",
        reservationId: concurrentReservation.id,
        alreadySynced: true,
      };
    }
    if (
      concurrentReservation.customer_id &&
      customerMatch.customerId &&
      concurrentReservation.customer_id !== customerMatch.customerId
    ) {
      throw new Error(
        "既存予約の顧客紐付けとメールの顧客照合結果が一致しません。誤更新を避けるため同期を停止しました。"
      );
    }

    const preserveConcurrentProgress = isProgressedReservationStatus(
      concurrentReservation.status
    );
    const concurrentPayload = {
      ...reservationPayload,
      status: preserveConcurrentProgress
        ? concurrentReservation.status!
        : reservationPayload.status,
      memo: preserveConcurrentProgress
        ? concurrentReservation.memo || reservationPayload.memo
        : reservationPayload.memo,
    };
    let concurrentUpdateQuery = context.supabase
      .from("reservations")
      .update(concurrentPayload)
      .eq("id", concurrentReservation.id)
      .eq("salon_id", context.salonId);
    concurrentUpdateQuery = concurrentReservation.status == null
      ? concurrentUpdateQuery.is("status", null)
      : concurrentUpdateQuery.eq("status", concurrentReservation.status);
    concurrentUpdateQuery = concurrentReservation.memo == null
      ? concurrentUpdateQuery.is("memo", null)
      : concurrentUpdateQuery.eq("memo", concurrentReservation.memo);
    concurrentUpdateQuery = concurrentReservation.start_at == null
      ? concurrentUpdateQuery.is("start_at", null)
      : concurrentUpdateQuery.eq("start_at", concurrentReservation.start_at);
    concurrentUpdateQuery = concurrentReservation.end_at == null
      ? concurrentUpdateQuery.is("end_at", null)
      : concurrentUpdateQuery.eq("end_at", concurrentReservation.end_at);
    concurrentUpdateQuery = concurrentReservation.customer_id == null
      ? concurrentUpdateQuery.is("customer_id", null)
      : concurrentUpdateQuery.eq("customer_id", concurrentReservation.customer_id);
    concurrentUpdateQuery = concurrentReservation.staff_id == null
      ? concurrentUpdateQuery.is("staff_id", null)
      : concurrentUpdateQuery.eq("staff_id", concurrentReservation.staff_id);
    concurrentUpdateQuery = concurrentReservation.menu == null
      ? concurrentUpdateQuery.is("menu", null)
      : concurrentUpdateQuery.eq("menu", concurrentReservation.menu);
    const { data: updated, error: updateError } = await concurrentUpdateQuery
      .select("id")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (updated?.id !== concurrentReservation.id) {
      const latest = await readReservationById(
        concurrentReservation.id,
        context
      );
      if (isCancelledReservationStatus(latest.status)) {
        return {
          mode: "cancelled",
          reservationId: latest.id,
          alreadyCancelled: true,
        };
      }
      if (latest.status !== concurrentReservation.status) {
        throw new Error(
          "同期中に予約状態が変更されました。最新状態を確認して再試行してください。"
        );
      }
      if (latest.memo !== concurrentReservation.memo) {
        throw new Error(
          "同期中に予約メモが変更されました。スタッフの追記を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (latest.customer_id !== concurrentReservation.customer_id) {
        throw new Error(
          "同期中に顧客紐付けが変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (latest.staff_id !== concurrentReservation.staff_id) {
        throw new Error(
          "同期中に担当スタッフが変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (latest.menu !== concurrentReservation.menu) {
        throw new Error(
          "同期中にメニューが変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (
        !isSameReservationDateTime(
          concurrentReservation.start_at,
          latest.start_at
        ) ||
        !isSameReservationDateTime(
          concurrentReservation.end_at,
          latest.end_at
        )
      ) {
        throw new Error(
          "同期中に予約日時が変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      throw new Error(
        "予約の更新結果を確認できません。予約一覧を確認してから再試行してください。"
      );
    }

    return {
      mode: "updated",
      reservationId: concurrentReservation.id,
      customerMatch,
    };
  }

  if (error) throw new Error(error.message);
  if (data?.id !== deterministicId) {
    throw new Error(
      "予約の保存結果を確認できません。予約一覧を確認してから再試行してください。"
    );
  }

  return {
    mode: "inserted",
    reservationId: data.id,
    customerMatch,
  };
}

async function cancelReservation(
  parsed: ParsedHpbMail,
  rawText: string,
  context: SyncContext
) {
  const sourceLabel = getSourceLabel(parsed.source);
  const reservationKey = getReservationNumberMemoKey(parsed.source);
  const deterministicId = buildExternalReservationId(
    parsed.source,
    parsed.reservationNumber
  );
  let existing = await findExistingExternalReservation(parsed, context);
  let reconciledManualEntry = false;
  let cancellationCustomerMatch: CustomerMatchResult | null = null;
  let cancellationCustomerId: string | null = null;

  if (!existing) {
    const { data, error } = await context.supabase
      .from("reservations")
      .select("id, salon_id, staff_id, memo, status")
      .eq("id", deterministicId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    existing = (data || null) as ExistingReservation | null;
  }

  if (existing?.id && existing.salon_id !== context.salonId) {
    throw new Error(
      "同じ外部予約番号が別サロンにあります。誤更新を避けるため同期を停止しました。"
    );
  }

  if (!existing?.id) {
    if (!parsed.customerName || !parsed.startAt || !parsed.endAt) {
      throw new Error(
        "外部予約番号に一致する予約がなく、キャンセル予約の保存に必要な氏名と来店日時が不足しています。"
      );
    }
    // A cancellation is still authoritative when its former provider staff
    // has been deactivated, renamed or removed. Keep the staff hint when it is
    // uniquely resolvable, but do not lose the cancellation tombstone solely
    // because that optional assignment no longer resolves. Customer/time
    // reconciliation remains fail-closed when more than one manual row fits.
    context.staffId = await resolveStaffId(parsed, context, {
      allowUnresolved: true,
    });

    // If the original provider booking mail was missed, staff may already have
    // entered the booking manually. A cancellation must close that row rather
    // than insert a second tombstone beside an active booking. Only a stable,
    // unique customer match may select the manual row; otherwise detect a
    // likely source-marked conflict and stop without cancelling the wrong guest.
    if (parsed.phone) {
      cancellationCustomerMatch = await findOrCreateCustomer(parsed, context);
      cancellationCustomerId = isStableCancellationCustomerMatch(
        cancellationCustomerMatch
      )
        ? cancellationCustomerMatch.customerId
        : null;
    }

    if (cancellationCustomerId) {
      const delayedManualEntry = await findDelayedManualEntry(
        parsed,
        context,
        cancellationCustomerId
      );
      if (delayedManualEntry) {
        existing = {
          ...delayedManualEntry,
          salon_id: context.salonId,
          start_at: delayedManualEntry.start_at ?? null,
          end_at: delayedManualEntry.end_at ?? null,
        };
        reconciledManualEntry = true;
      }
    } else {
      const unresolvedManualEntry = await findDelayedManualEntry(parsed, context);
      if (unresolvedManualEntry) {
        const matchStatus = cancellationCustomerMatch?.matchStatus || "phone_missing";
        const matchedCount = cancellationCustomerMatch?.matchedCount || 0;
        throw new Error(
          `キャンセル対象の手入力予約に対して顧客を一意に特定できません（${matchStatus}: ${matchedCount}件）。誤更新を避けるため同期を停止しました。`
        );
      }
    }

    if (!existing?.id) {
      const cancellationMemo = appendExternalCancellationMemo({
        existingMemo: [
          `${reservationKey}：${parsed.reservationNumber}`,
          `${sourceLabel}氏名：${parsed.customerName}`,
          `${sourceLabel}担当：${parsed.staffName}`,
        ].join("\n"),
        sourceLabel,
        rawText,
      });
      const cancellationPayload: {
        id: string;
        salon_id: string;
        customer_id?: string;
        menu: string;
        start_at: string;
        end_at: string;
        status: string;
        memo: string;
        staff_id?: string | null;
      } = {
        id: deterministicId,
        salon_id: context.salonId,
        menu: parsed.menu,
        start_at: parsed.startAt,
        end_at: parsed.endAt,
        status: "キャンセル",
        memo: cancellationMemo,
      };

      if (cancellationCustomerId) {
        cancellationPayload.customer_id = cancellationCustomerId;
      }

      if (context.staffId) {
        cancellationPayload.staff_id = context.staffId;
      }

      const { data, error } = await context.supabase
        .from("reservations")
        .insert(cancellationPayload)
        .select("id")
        .single();

      if (error?.code === "23505") {
        existing = await readReservationById(
          deterministicId,
          context
        );
      } else {
        if (error) throw new Error(error.message);
        if (data?.id !== deterministicId) {
          throw new Error(
            "キャンセル予約の保存結果を確認できません。予約一覧を確認してから再試行してください。"
          );
        }

        return {
          mode: "cancelled",
          reservationId: deterministicId,
          createdCancellation: true,
        };
      }
    }
  }

  const buildNextMemo = (memo: string | null | undefined) =>
    reconciledManualEntry && cancellationCustomerMatch
      ? buildReconciledCancellationMemo({
          existingMemo: memo,
          parsed,
          customerMatch: cancellationCustomerMatch,
          sourceLabel,
          reservationKey,
          rawText,
        })
      : appendExternalCancellationMemo({
          existingMemo: memo,
          sourceLabel,
          rawText,
        });
  const nextMemo = buildNextMemo(existing.memo);

  if (
    isCancelledReservationStatus(existing.status) &&
    nextMemo === existing.memo
  ) {
    return {
      mode: "cancelled",
      reservationId: existing.id,
      alreadyCancelled: true,
    };
  }

  const cancellationPayload: {
    status: string;
    memo: string;
    customer_id?: string;
  } = {
    status: "キャンセル",
    memo: nextMemo,
  };
  if (reconciledManualEntry && cancellationCustomerMatch?.customerId) {
    cancellationPayload.customer_id = cancellationCustomerMatch.customerId;
  }
  let cancellationUpdateQuery = context.supabase
    .from("reservations")
    .update(cancellationPayload)
    .eq("id", existing.id)
    .eq("salon_id", context.salonId);
  cancellationUpdateQuery = existing.status == null
    ? cancellationUpdateQuery.is("status", null)
    : cancellationUpdateQuery.eq("status", existing.status);
  cancellationUpdateQuery = existing.memo == null
    ? cancellationUpdateQuery.is("memo", null)
    : cancellationUpdateQuery.eq("memo", existing.memo);
  if (reconciledManualEntry) {
    cancellationUpdateQuery = existing.start_at == null
      ? cancellationUpdateQuery.is("start_at", null)
      : cancellationUpdateQuery.eq("start_at", existing.start_at);
    cancellationUpdateQuery = existing.end_at == null
      ? cancellationUpdateQuery.is("end_at", null)
      : cancellationUpdateQuery.eq("end_at", existing.end_at);
    cancellationUpdateQuery = existing.customer_id == null
      ? cancellationUpdateQuery.is("customer_id", null)
      : cancellationUpdateQuery.eq("customer_id", existing.customer_id);
    cancellationUpdateQuery = existing.staff_id == null
      ? cancellationUpdateQuery.is("staff_id", null)
      : cancellationUpdateQuery.eq("staff_id", existing.staff_id);
    cancellationUpdateQuery = existing.menu == null
      ? cancellationUpdateQuery.is("menu", null)
      : cancellationUpdateQuery.eq("menu", existing.menu);
  }
  const { data, error } = await cancellationUpdateQuery
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.id !== existing.id) {
    const latest = await readReservationById(existing.id, context);
    const unchangedManualIdentity =
      !reconciledManualEntry ||
      (latest.customer_id === existing.customer_id &&
        latest.staff_id === existing.staff_id &&
        latest.menu === existing.menu &&
        isSameReservationDateTime(existing.start_at, latest.start_at) &&
        isSameReservationDateTime(existing.end_at, latest.end_at));
    if (
      latest.status === existing.status &&
      latest.memo === existing.memo &&
      unchangedManualIdentity
    ) {
      throw new Error(
        "キャンセルの更新結果を確認できません。予約一覧を確認してから再試行してください。"
      );
    }

    const retryMemo = buildNextMemo(latest.memo);
    if (
      isCancelledReservationStatus(latest.status) &&
      retryMemo === latest.memo
    ) {
      return {
        mode: "cancelled",
        reservationId: latest.id,
        alreadyCancelled: true,
      };
    }

    if (reconciledManualEntry) {
      if (latest.customer_id !== existing.customer_id) {
        throw new Error(
          "同期中に顧客紐付けが変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (latest.staff_id !== existing.staff_id) {
        throw new Error(
          "同期中に担当スタッフが変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (latest.menu !== existing.menu) {
        throw new Error(
          "同期中にメニューが変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
      if (
        !isSameReservationDateTime(existing.start_at, latest.start_at) ||
        !isSameReservationDateTime(existing.end_at, latest.end_at)
      ) {
        throw new Error(
          "同期中に予約日時が変更されました。スタッフの変更を保護したため、最新内容を確認してから再試行してください。"
        );
      }
    }

    const retryPayload: {
      status: string;
      memo: string;
      customer_id?: string;
    } = {
      status: "キャンセル",
      memo: retryMemo,
    };
    if (reconciledManualEntry && cancellationCustomerMatch?.customerId) {
      retryPayload.customer_id = cancellationCustomerMatch.customerId;
    }
    let retryQuery = context.supabase
      .from("reservations")
      .update(retryPayload)
      .eq("id", latest.id)
      .eq("salon_id", context.salonId);
    retryQuery = latest.status == null
      ? retryQuery.is("status", null)
      : retryQuery.eq("status", latest.status);
    retryQuery = latest.memo == null
      ? retryQuery.is("memo", null)
      : retryQuery.eq("memo", latest.memo);
    if (reconciledManualEntry) {
      retryQuery = latest.start_at == null
        ? retryQuery.is("start_at", null)
        : retryQuery.eq("start_at", latest.start_at);
      retryQuery = latest.end_at == null
        ? retryQuery.is("end_at", null)
        : retryQuery.eq("end_at", latest.end_at);
      retryQuery = latest.customer_id == null
        ? retryQuery.is("customer_id", null)
        : retryQuery.eq("customer_id", latest.customer_id);
      retryQuery = latest.staff_id == null
        ? retryQuery.is("staff_id", null)
        : retryQuery.eq("staff_id", latest.staff_id);
      retryQuery = latest.menu == null
        ? retryQuery.is("menu", null)
        : retryQuery.eq("menu", latest.menu);
    }
    const { data: retried, error: retryError } = await retryQuery
      .select("id")
      .maybeSingle();

    if (retryError) throw new Error(retryError.message);
    if (retried?.id !== latest.id) {
      throw new Error(
        "同期中に予約が続けて変更されました。最新状態を確認して再試行してください。"
      );
    }
  }

  return {
    mode: "cancelled",
    reservationId: existing.id,
    ...(reconciledManualEntry
      ? {
          reconciledManualEntry: true,
          customerMatch: cancellationCustomerMatch,
        }
      : {}),
  };
}

export async function syncHpbMailText(rawText: string, mailSubject = "") {
  const parsed = parseHpbMailText(rawText, mailSubject);
  const context = await resolveSyncContext();

  const result =
    parsed.action === "cancel"
      ? await cancelReservation(parsed, rawText, context)
      : await upsertReservation(parsed, rawText, context);

  return {
    parsed,
    result,
  };
}
