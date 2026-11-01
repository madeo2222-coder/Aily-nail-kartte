type SyncLockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredHpbGmailSyncUnknownLock = {
  version: 1;
  savedAt: number;
};

const STORAGE_KEY = "aily:hpb-gmail-sync-result-unknown:v1";

export const HPB_GMAIL_SYNC_UNKNOWN_LOCK_TTL_MS = 30 * 60 * 1000;

export function readHpbGmailSyncUnknownLock(
  storage: SyncLockStorage,
  now = Date.now(),
) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const stored = JSON.parse(raw) as Partial<StoredHpbGmailSyncUnknownLock>;
    const isValid =
      stored.version === 1 &&
      typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt < HPB_GMAIL_SYNC_UNKNOWN_LOCK_TTL_MS;

    if (!isValid) {
      storage.removeItem(STORAGE_KEY);
      return false;
    }

    return true;
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage access can be unavailable in privacy-restricted browsers.
    }
    return false;
  }
}

export function saveHpbGmailSyncUnknownLock(
  storage: SyncLockStorage,
  unknown: boolean,
  now = Date.now(),
) {
  try {
    if (!unknown) {
      storage.removeItem(STORAGE_KEY);
      return;
    }

    const stored: StoredHpbGmailSyncUnknownLock = {
      version: 1,
      savedAt: now,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // The in-memory lock still protects the current screen when storage fails.
  }
}
