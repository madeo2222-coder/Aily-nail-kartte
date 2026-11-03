export const RESERVATION_STAFF_MUTATION_REQUEST_TIMEOUT_MS = 15 * 1000;

export async function requestReservationStaffMutationWithTimeout(
  path: string,
  method: "PATCH" | "DELETE",
  body: unknown,
  fetchApi: typeof fetch = globalThis.fetch,
  timeoutMs = RESERVATION_STAFF_MUTATION_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchApi(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
