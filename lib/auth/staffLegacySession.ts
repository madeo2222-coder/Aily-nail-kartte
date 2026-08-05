const STAFF_SESSION_VERSION = 1;
const STAFF_SESSION_LIFETIME_SECONDS = 60 * 60 * 12;
const MAX_CLOCK_SKEW_SECONDS = 60;
const MINIMUM_SECRET_BYTES = 32;

export const STAFF_SESSION_COOKIE = "staff_session";
export const STAFF_ROLE_COOKIE = "staff_role";

export type LegacyStaffRole = "owner" | "staff";

export type LegacyStaffSession = {
  version: typeof STAFF_SESSION_VERSION;
  role: LegacyStaffRole;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const paddingLength = (4 - (value.length % 4)) % 4;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(paddingLength);

  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function getSecretBytes() {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) return null;

  const secretBytes = new TextEncoder().encode(secret);
  return secretBytes.byteLength >= MINIMUM_SECRET_BYTES ? secretBytes : null;
}

async function getSigningKey() {
  const secretBytes = getSecretBytes();
  if (!secretBytes) return null;

  return crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function isLegacyStaffRole(value: unknown): value is LegacyStaffRole {
  return value === "owner" || value === "staff";
}

function isLegacyStaffSession(value: unknown): value is LegacyStaffSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const session = value as Record<string, unknown>;
  const keys = Object.keys(session).sort();
  const expectedKeys = ["expiresAt", "issuedAt", "nonce", "role", "version"];

  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    session.version === STAFF_SESSION_VERSION &&
    isLegacyStaffRole(session.role) &&
    Number.isSafeInteger(session.issuedAt) &&
    Number.isSafeInteger(session.expiresAt) &&
    typeof session.nonce === "string" &&
    /^[A-Za-z0-9_-]{22}$/.test(session.nonce) &&
    (session.expiresAt as number) - (session.issuedAt as number) ===
      STAFF_SESSION_LIFETIME_SECONDS
  );
}

export async function createLegacyStaffSession(role: LegacyStaffRole) {
  const signingKey = await getSigningKey();
  if (!signingKey) return null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);

  const payload: LegacyStaffSession = {
    version: STAFF_SESSION_VERSION,
    role,
    issuedAt,
    expiresAt: issuedAt + STAFF_SESSION_LIFETIME_SECONDS,
    nonce: encodeBase64Url(nonceBytes),
  };
  const encodedPayload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    new TextEncoder().encode(encodedPayload)
  );

  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyLegacyStaffSession(token: string | undefined) {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, encodedSignature] = parts;
  const payloadBytes = decodeBase64Url(encodedPayload);
  const signatureBytes = decodeBase64Url(encodedSignature);
  const signingKey = await getSigningKey();

  if (!payloadBytes || !signatureBytes || !signingKey) return null;

  const signatureIsValid = await crypto.subtle.verify(
    "HMAC",
    signingKey,
    signatureBytes,
    new TextEncoder().encode(encodedPayload)
  );
  if (!signatureIsValid) return null;

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }

  if (!isLegacyStaffSession(parsedPayload)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (
    parsedPayload.issuedAt > now + MAX_CLOCK_SKEW_SECONDS ||
    parsedPayload.expiresAt <= now
  ) {
    return null;
  }

  return parsedPayload;
}
