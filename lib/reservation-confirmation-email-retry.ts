export type ConfirmationEmailApiResult = {
  ok?: boolean;
  sent?: boolean;
  retryable?: boolean;
  retryWindowHours?: number;
  retryToken?: string;
  message?: string;
};

export type ConfirmationEmailNotice = {
  message: string;
  canRetry: boolean;
  completed: boolean;
  retryWindowHours: number | null;
  expiresAt: number | null;
  retryToken?: string;
  attemptId?: string;
  actionLabel?: "確定メールを送信" | "確定メールを再試行";
};

export type ConfirmationEmailInProgressLock = {
  attemptId: string;
  ownerId?: string;
  message: string;
  retryAt: number;
};

export type ConfirmationEmailRequestBody = {
  reservationId: string;
  attemptId: string;
  expectedIdempotencyKey?: string;
};

const DEFAULT_RETRY_WINDOW_HOURS = 24;
const STORAGE_KEY_PREFIX = "aily:confirmation-email-retry:v1:";
const IN_PROGRESS_STORAGE_KEY_PREFIX =
  "aily:confirmation-email-in-progress:v1:";
export const CONFIRMATION_EMAIL_IN_PROGRESS_LOCK_TTL_MS = 5 * 60 * 1000;
export const CONFIRMATION_EMAIL_REQUEST_TIMEOUT_MS = 15 * 1000;

type RetryNoticeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredConfirmationEmailRetryNotice = {
  version: 1;
  savedAt: number;
  message: string;
  expiresAt: number;
  actionLabel: NonNullable<ConfirmationEmailNotice["actionLabel"]>;
  retryToken?: string;
  attemptId?: string;
};

type StoredConfirmationEmailInProgressLock = {
  version: 1;
  savedAt: number;
  attemptId: string;
  ownerId?: string;
};

export async function requestConfirmationEmailWithTimeout(
  body: ConfirmationEmailRequestBody,
  fetchApi: typeof fetch = globalThis.fetch,
  timeoutMs = CONFIRMATION_EMAIL_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchApi("/api/send-reservation-confirmed-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

const CONFIRMATION_EMAIL_ATTEMPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getStorageKey(reservationId: string) {
  return `${STORAGE_KEY_PREFIX}${reservationId}`;
}

function getInProgressStorageKey(reservationId: string) {
  return `${IN_PROGRESS_STORAGE_KEY_PREFIX}${reservationId}`;
}

function isActionLabel(
  value: unknown
): value is NonNullable<ConfirmationEmailNotice["actionLabel"]> {
  return value === "確定メールを送信" || value === "確定メールを再試行";
}

function normalizeAttemptId(value: unknown) {
  return typeof value === "string" &&
    CONFIRMATION_EMAIL_ATTEMPT_ID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : undefined;
}

export function createConfirmationEmailAttemptId(
  cryptoApi: Pick<Crypto, "randomUUID" | "getRandomValues"> | undefined =
    globalThis.crypto
) {
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID().toLowerCase();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getConfirmationEmailInProgressLock(
  attemptId = createConfirmationEmailAttemptId(),
  now = Date.now(),
  ownerId?: string
): ConfirmationEmailInProgressLock {
  return {
    attemptId,
    ownerId: normalizeAttemptId(ownerId),
    message:
      "予約確定メールの送信処理が進行中です。5分後に画面を再読み込みして結果を確認してください。",
    retryAt: now + CONFIRMATION_EMAIL_IN_PROGRESS_LOCK_TTL_MS,
  };
}

export function readConfirmationEmailInProgressLock(
  storage: RetryNoticeStorage,
  reservationId: string,
  now = Date.now()
): ConfirmationEmailInProgressLock | null {
  const key = getInProgressStorageKey(reservationId);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const stored = JSON.parse(
      raw
    ) as Partial<StoredConfirmationEmailInProgressLock>;
    const attemptId = normalizeAttemptId(stored.attemptId);
    const isValid =
      stored.version === 1 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt < CONFIRMATION_EMAIL_IN_PROGRESS_LOCK_TTL_MS &&
      Boolean(attemptId);

    if (!isValid || !attemptId || typeof stored.savedAt !== "number") {
      storage.removeItem(key);
      return null;
    }

    return getConfirmationEmailInProgressLock(
      attemptId,
      stored.savedAt,
      normalizeAttemptId(stored.ownerId)
    );
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage access can be unavailable in privacy-restricted browsers.
    }
    return null;
  }
}

export function saveConfirmationEmailInProgressLock(
  storage: RetryNoticeStorage,
  reservationId: string,
  lock: ConfirmationEmailInProgressLock | null,
  now = Date.now()
) {
  const key = getInProgressStorageKey(reservationId);

  try {
    if (!lock) {
      storage.removeItem(key);
      return true;
    }

    const attemptId = normalizeAttemptId(lock.attemptId);
    if (!attemptId || lock.retryAt <= now) {
      storage.removeItem(key);
      return true;
    }

    const stored: StoredConfirmationEmailInProgressLock = {
      version: 1,
      savedAt: now,
      attemptId,
      ...(lock.ownerId ? { ownerId: normalizeAttemptId(lock.ownerId) } : {}),
    };
    storage.setItem(key, JSON.stringify(stored));
    return true;
  } catch {
    // The current screen still keeps its in-memory request guard.
    return false;
  }
}

export async function claimConfirmationEmailInProgressLock(
  storage: RetryNoticeStorage,
  reservationId: string,
  attemptId = createConfirmationEmailAttemptId(),
  ownerId = createConfirmationEmailAttemptId(),
  now = Date.now(),
  settle: () => Promise<void> = () =>
    new Promise((resolve) => {
      if (typeof globalThis.setTimeout === "function") {
        globalThis.setTimeout(resolve, 0);
        return;
      }
      resolve();
    })
) {
  const existing = readConfirmationEmailInProgressLock(
    storage,
    reservationId,
    now
  );
  if (existing) return { acquired: false, lock: existing };

  const lock = getConfirmationEmailInProgressLock(attemptId, now, ownerId);
  const persisted = saveConfirmationEmailInProgressLock(
    storage,
    reservationId,
    lock,
    now
  );
  if (!persisted) return { acquired: true, lock };

  await settle();
  const current = readConfirmationEmailInProgressLock(
    storage,
    reservationId,
    Date.now()
  );
  const acquired =
    Boolean(lock.ownerId) && current?.ownerId === lock.ownerId;

  return { acquired, lock: current ?? lock };
}

export function getConfirmationEmailInProgressNotice(
  lock: ConfirmationEmailInProgressLock
): ConfirmationEmailNotice {
  return {
    message: lock.message,
    canRetry: false,
    completed: false,
    retryWindowHours: null,
    expiresAt: lock.retryAt,
  };
}

export function readConfirmationEmailDisplayNotice(
  storage: RetryNoticeStorage,
  reservationId: string,
  now = Date.now()
): ConfirmationEmailNotice | null {
  const inProgressLock = readConfirmationEmailInProgressLock(
    storage,
    reservationId,
    now
  );

  return inProgressLock
    ? getConfirmationEmailInProgressNotice(inProgressLock)
    : readConfirmationEmailRetryNotice(storage, reservationId, now);
}

export function readConfirmationEmailRetryNotice(
  storage: RetryNoticeStorage,
  reservationId: string,
  now = Date.now()
): ConfirmationEmailNotice | null {
  const key = getStorageKey(reservationId);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredConfirmationEmailRetryNotice>;
    const isValid =
      stored.version === 1 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      typeof stored.message === "string" &&
      stored.message.trim().length > 0 &&
      typeof stored.expiresAt === "number" &&
      Number.isFinite(stored.expiresAt) &&
      now < stored.expiresAt &&
      isActionLabel(stored.actionLabel);
    const retryToken =
      typeof stored.retryToken === "string" && stored.retryToken.trim()
        ? stored.retryToken.trim()
        : undefined;
    const attemptId = normalizeAttemptId(stored.attemptId);

    if (!isValid) {
      storage.removeItem(key);
      return null;
    }

    const message = stored.message as string;
    const expiresAt = stored.expiresAt as number;
    const actionLabel = stored.actionLabel as NonNullable<
      ConfirmationEmailNotice["actionLabel"]
    >;
    const retryWindowHours = Math.max(
      1,
      Math.ceil((expiresAt - now) / (60 * 60 * 1000))
    );

    return {
      message,
      canRetry: true,
      completed: false,
      retryWindowHours,
      expiresAt,
      actionLabel,
      retryToken,
      attemptId,
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage access can be unavailable in privacy-restricted browsers.
    }
    return null;
  }
}

export function saveConfirmationEmailRetryNotice(
  storage: RetryNoticeStorage,
  reservationId: string,
  notice: ConfirmationEmailNotice | null,
  now = Date.now()
) {
  const key = getStorageKey(reservationId);

  try {
    if (
      !notice?.canRetry ||
      notice.expiresAt === null ||
      notice.expiresAt <= now ||
      !isActionLabel(notice.actionLabel)
    ) {
      storage.removeItem(key);
      return;
    }

    const attemptId = normalizeAttemptId(notice.attemptId);
    const stored: StoredConfirmationEmailRetryNotice = {
      version: 1,
      savedAt: now,
      message: notice.message,
      expiresAt: notice.expiresAt,
      actionLabel: notice.actionLabel,
      ...(notice.retryToken ? { retryToken: notice.retryToken } : {}),
      ...(attemptId ? { attemptId } : {}),
    };
    storage.setItem(key, JSON.stringify(stored));
  } catch {
    // The in-memory retry notice still protects the current screen.
  }
}

export function getConfirmationEmailRecoveryNotice(
  now = Date.now(),
  previousExpiresAt: number | null = null
): ConfirmationEmailNotice {
  return {
    message:
      "予約確定の通信結果を確認できませんでした。最新情報で確定済みと確認できた場合は、同じ画面から24時間以内に確定メールを送信できます。",
    canRetry: true,
    completed: false,
    retryWindowHours: DEFAULT_RETRY_WINDOW_HOURS,
    expiresAt: getRetryExpiresAt(
      now,
      DEFAULT_RETRY_WINDOW_HOURS,
      previousExpiresAt
    ),
    actionLabel: "確定メールを送信",
  };
}

export function getConfirmationEmailNotice(
  responseOk: boolean,
  result: ConfirmationEmailApiResult | null,
  now = Date.now(),
  previousExpiresAt: number | null = null,
  attemptId?: string
): ConfirmationEmailNotice {
  const normalizedAttemptId = normalizeAttemptId(attemptId);

  if (!result) {
    const expiresAt = getRetryExpiresAt(
      now,
      DEFAULT_RETRY_WINDOW_HOURS,
      previousExpiresAt
    );
    return {
      message:
        "メール通知の送信結果を確認できませんでした。予約は確定済みです。同じ画面から24時間以内に再試行できます。",
      canRetry: true,
      completed: false,
      retryWindowHours: DEFAULT_RETRY_WINDOW_HOURS,
      expiresAt,
      actionLabel: "確定メールを再試行",
      attemptId: normalizedAttemptId,
    };
  }

  if (responseOk && result.ok) {
    return {
      message:
        result.message ||
        (result.sent
          ? "予約確定メールを送信しました。"
          : "予約確定メールは送信されませんでした。"),
      canRetry: false,
      completed: true,
      retryWindowHours: null,
      expiresAt: null,
    };
  }

  const canRetry = result.retryable === true;
  const retryWindowHours = canRetry
    ? result.retryWindowHours || DEFAULT_RETRY_WINDOW_HOURS
    : null;
  const expiresAt = retryWindowHours
    ? getRetryExpiresAt(now, retryWindowHours, previousExpiresAt)
    : null;

  if (canRetry && expiresAt !== null && expiresAt <= now) {
    return getExpiredConfirmationEmailNotice();
  }

  return {
    message:
      result.message ||
      (canRetry
        ? `メール通知の送信結果を確認できませんでした。同じ画面から${retryWindowHours}時間以内に再試行できます。`
        : "メール通知に失敗しました。予約は確定済みです。"),
    canRetry,
    completed: false,
    retryWindowHours,
    expiresAt,
    actionLabel: canRetry ? "確定メールを再試行" : undefined,
    retryToken:
      canRetry && typeof result.retryToken === "string"
        ? result.retryToken
        : undefined,
    attemptId: canRetry ? normalizedAttemptId : undefined,
  };
}

function getRetryExpiresAt(
  now: number,
  retryWindowHours: number,
  previousExpiresAt: number | null
) {
  const candidate = now + retryWindowHours * 60 * 60 * 1000;
  return previousExpiresAt === null
    ? candidate
    : Math.min(previousExpiresAt, candidate);
}

export function isConfirmationEmailRetryActive(
  notice: ConfirmationEmailNotice | null | undefined,
  now = Date.now()
) {
  return Boolean(
    notice?.canRetry &&
      notice.expiresAt !== null &&
      now < notice.expiresAt
  );
}

export function getConfirmationEmailActionPrompt(
  notice: ConfirmationEmailNotice | null | undefined
) {
  return notice?.actionLabel === "確定メールを送信"
    ? "最新情報で確定済みと確認した予約に、確定メールを送信しますか？送信記録がある場合は重複送信しません。"
    : "予約確定メールを再試行しますか？24時間以内は同じ予約内容の重複送信を防ぎます。";
}

export function getExpiredConfirmationEmailNotice(
  actionLabel: ConfirmationEmailNotice["actionLabel"] =
    "確定メールを再試行"
): ConfirmationEmailNotice {
  return {
    message:
      actionLabel === "確定メールを送信"
        ? "予約確定メールを安全に送信できる期限を過ぎました。送信せず、メールの送信履歴を確認してください。"
        : "予約確定メールの安全な再試行期限を過ぎました。再送せず、メールの送信履歴を確認してください。",
    canRetry: false,
    completed: false,
    retryWindowHours: null,
    expiresAt: null,
  };
}
