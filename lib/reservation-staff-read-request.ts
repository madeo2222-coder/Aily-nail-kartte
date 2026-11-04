export const RESERVATION_STAFF_READ_TIMEOUT_MS = 15_000;

export async function requestReservationStaffReadWithTimeout(
  path: string,
  fetchApi: typeof fetch = fetch,
  timeoutMs = RESERVATION_STAFF_READ_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchApi(path, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
