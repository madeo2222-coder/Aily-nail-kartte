export const STAFF_RESERVATION_CREATE_REQUEST_TIMEOUT_MS = 15 * 1000;

export async function requestStaffReservationCreationWithTimeout(
  body: unknown,
  fetchApi: typeof fetch = globalThis.fetch,
  timeoutMs = STAFF_RESERVATION_CREATE_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchApi("/api/reservations/staff-create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
