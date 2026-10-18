import { createHmac, timingSafeEqual } from "crypto";

export const LINE_STATE_COOKIE = "line_login_state";
export const LINE_PENDING_COOKIE = "customer_line_pending";
export const LINE_SESSION_COOKIE = "customer_line_session";

const COOKIE_VERSION = 1;

type SignedCookieEnvelope = {
  v: number;
  exp: number;
  payload: unknown;
};

export type LineStatePayload = {
  state: string;
  next: string;
};

export type LinePendingPayload = {
  line_user_id: string;
  display_name?: string;
  picture_url?: string;
  next?: string;
};

export type LineSessionPayload = {
  customer_id: string;
  line_user_id: string;
};

function getSigningSecret() {
  const secret = process.env.LINE_LOGIN_CHANNEL_SECRET?.trim();

  if (!secret) {
    throw new Error("LINE Login cookie signing secret is missing.");
  }

  return secret;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function createSignedCookie(payload: unknown, maxAgeSeconds: number) {
  const envelope: SignedCookieEnvelope = {
    v: COOKIE_VERSION,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
    payload,
  };
  const encoded = Buffer.from(JSON.stringify(envelope), "utf8").toString(
    "base64url"
  );
  const signature = createHmac("sha256", getSigningSecret())
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

function readSignedCookie(value: string | undefined) {
  if (!value || value.length > 8192) return null;

  const parts = value.split(".");

  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const expected = createHmac("sha256", getSigningSecret())
    .update(parts[0])
    .digest();

  let received: Buffer;

  try {
    received = Buffer.from(parts[1], "base64url");
  } catch {
    return null;
  }

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  try {
    const envelope = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8")
    ) as Partial<SignedCookieEnvelope>;

    if (
      envelope.v !== COOKIE_VERSION ||
      typeof envelope.exp !== "number" ||
      !Number.isSafeInteger(envelope.exp) ||
      envelope.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return envelope.payload;
  } catch {
    return null;
  }
}

export function createLineStateCookie(
  payload: LineStatePayload,
  maxAgeSeconds: number
) {
  return createSignedCookie(payload, maxAgeSeconds);
}

export function readLineStateCookie(
  value: string | undefined
): LineStatePayload | null {
  const payload = readSignedCookie(value);

  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  if (!isNonEmptyString(record.state) || typeof record.next !== "string") {
    return null;
  }

  return {
    state: record.state.trim(),
    next: record.next,
  };
}

export function createLinePendingCookie(
  payload: LinePendingPayload,
  maxAgeSeconds: number
) {
  return createSignedCookie(payload, maxAgeSeconds);
}

export function readLinePendingCookie(
  value: string | undefined
): LinePendingPayload | null {
  const payload = readSignedCookie(value);

  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  if (!isNonEmptyString(record.line_user_id)) return null;

  return {
    line_user_id: record.line_user_id.trim(),
    display_name: getOptionalString(record.display_name),
    picture_url: getOptionalString(record.picture_url),
    next: getOptionalString(record.next),
  };
}

export function createCustomerLineSessionCookie(
  payload: LineSessionPayload,
  maxAgeSeconds: number
) {
  return createSignedCookie(payload, maxAgeSeconds);
}

export function readCustomerLineSessionCookie(
  value: string | undefined
): LineSessionPayload | null {
  const payload = readSignedCookie(value);

  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  if (
    !isNonEmptyString(record.customer_id) ||
    !isNonEmptyString(record.line_user_id)
  ) {
    return null;
  }

  return {
    customer_id: record.customer_id.trim(),
    line_user_id: record.line_user_id.trim(),
  };
}
