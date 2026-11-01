type SyncLockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredHpbManualSyncUnknownLock = {
  fingerprint: string;
  savedAt: number;
};

const STORAGE_KEY = "aily:hpb-manual-sync-result-unknown:v1";
const MAX_LOCKS = 20;

export const HPB_MANUAL_SYNC_UNKNOWN_LOCK_TTL_MS = 30 * 60 * 1000;

function hashText(value: string, seed: number) {
  let hash = seed >>> 0;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

export function buildHpbManualSyncFingerprint(subject: string, text: string) {
  const normalized = JSON.stringify([subject.trim(), text.trim()]);
  return [
    normalized.length,
    hashText(normalized, 2_166_136_261),
    hashText(normalized, 2_654_435_769),
  ].join(":");
}

function readActiveLocks(storage: SyncLockStorage, now: number) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || !("locks" in value)) return [];

    const locks = (value as { locks?: unknown }).locks;
    if (!Array.isArray(locks)) return [];

    return locks.filter((item): item is StoredHpbManualSyncUnknownLock => {
      if (!item || typeof item !== "object") return false;

      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.fingerprint !== "string" ||
        typeof candidate.savedAt !== "number" ||
        !Number.isFinite(candidate.savedAt)
      ) {
        return false;
      }

      const age = now - candidate.savedAt;
      return age >= 0 && age < HPB_MANUAL_SYNC_UNKNOWN_LOCK_TTL_MS;
    });
  } catch {
    return [];
  }
}

function writeLocks(
  storage: SyncLockStorage,
  locks: StoredHpbManualSyncUnknownLock[],
) {
  try {
    if (locks.length === 0) {
      storage.removeItem(STORAGE_KEY);
      return;
    }

    storage.setItem(STORAGE_KEY, JSON.stringify({ locks }));
  } catch {
    // The current screen still keeps its in-memory result-unknown lock.
  }
}

export function hasAnyHpbManualSyncUnknownLock(
  storage: SyncLockStorage,
  now = Date.now(),
) {
  const locks = readActiveLocks(storage, now);
  writeLocks(storage, locks);
  return locks.length > 0;
}

export function getHpbManualSyncUnknownLockUntil(
  storage: SyncLockStorage,
  now = Date.now(),
) {
  const locks = readActiveLocks(storage, now);
  writeLocks(storage, locks);
  if (locks.length === 0) return null;

  return Math.max(
    ...locks.map(
      (lock) => lock.savedAt + HPB_MANUAL_SYNC_UNKNOWN_LOCK_TTL_MS,
    ),
  );
}

export function hasHpbManualSyncUnknownLock(
  storage: SyncLockStorage,
  fingerprint: string,
  now = Date.now(),
) {
  const locks = readActiveLocks(storage, now);
  writeLocks(storage, locks);
  return locks.some((lock) => lock.fingerprint === fingerprint);
}

export function markHpbManualSyncResultUnknown(
  storage: SyncLockStorage,
  fingerprint: string,
  now = Date.now(),
) {
  const locks = readActiveLocks(storage, now).filter(
    (lock) => lock.fingerprint !== fingerprint,
  );
  locks.push({ fingerprint, savedAt: now });
  writeLocks(storage, locks.slice(-MAX_LOCKS));
}

export function clearHpbManualSyncUnknownLock(
  storage: SyncLockStorage,
  fingerprint: string,
  now = Date.now(),
) {
  const locks = readActiveLocks(storage, now).filter(
    (lock) => lock.fingerprint !== fingerprint,
  );
  writeLocks(storage, locks);
}
