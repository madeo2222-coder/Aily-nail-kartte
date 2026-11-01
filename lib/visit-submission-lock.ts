export type VisitSubmissionIdentity = {
  reservationId: string | null;
  customerId: string;
  staffId: string | null;
  visitDate: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredLock = {
  fingerprint: string;
  createdAt: number;
};

const STORAGE_KEY = "aily:visit-submission-locks:v1";
const LOCK_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_LOCKS = 20;

export function buildVisitSubmissionFingerprint(
  identity: VisitSubmissionIdentity,
) {
  return JSON.stringify([
    identity.reservationId,
    identity.customerId,
    identity.staffId,
    identity.visitDate,
  ]);
}

function readActiveLocks(storage: StorageLike, now: number) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || "null") as unknown;
    if (!value || typeof value !== "object" || !("locks" in value)) return [];

    const locks = (value as { locks?: unknown }).locks;
    if (!Array.isArray(locks)) return [];

    return locks.filter((item): item is StoredLock => {
      if (!item || typeof item !== "object") return false;

      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.fingerprint !== "string" ||
        typeof candidate.createdAt !== "number" ||
        !Number.isFinite(candidate.createdAt)
      ) {
        return false;
      }

      const age = now - candidate.createdAt;
      return age >= -LOCK_TTL_MS && age <= LOCK_TTL_MS;
    });
  } catch {
    return [];
  }
}

function writeLocks(storage: StorageLike, locks: StoredLock[]) {
  try {
    if (locks.length === 0) {
      storage.removeItem(STORAGE_KEY);
      return;
    }

    storage.setItem(STORAGE_KEY, JSON.stringify({ locks }));
  } catch {
    // The current page still keeps its in-memory submission lock.
  }
}

export function hasActiveVisitSubmissionLock(
  storage: StorageLike,
  fingerprint: string,
  now = Date.now(),
) {
  const locks = readActiveLocks(storage, now);
  writeLocks(storage, locks);
  return locks.some((lock) => lock.fingerprint === fingerprint);
}

export function markVisitSubmissionPending(
  storage: StorageLike,
  fingerprint: string,
  now = Date.now(),
) {
  const locks = readActiveLocks(storage, now).filter(
    (lock) => lock.fingerprint !== fingerprint,
  );

  locks.push({ fingerprint, createdAt: now });
  writeLocks(storage, locks.slice(-MAX_LOCKS));
}

export function clearVisitSubmissionLock(
  storage: StorageLike,
  fingerprint: string,
  now = Date.now(),
) {
  const locks = readActiveLocks(storage, now).filter(
    (lock) => lock.fingerprint !== fingerprint,
  );
  writeLocks(storage, locks);
}
