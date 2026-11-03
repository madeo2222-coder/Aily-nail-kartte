export const RESERVATION_CONFIRMATION_REQUEST_TIMEOUT_MS = 15 * 1000;

export async function requestReservationConfirmationWithTimeout(
  path: string,
  body: unknown,
  fetchApi: typeof fetch = globalThis.fetch,
  timeoutMs = RESERVATION_CONFIRMATION_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchApi(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
