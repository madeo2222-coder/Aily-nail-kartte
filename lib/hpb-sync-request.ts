export const HPB_SYNC_REQUEST_TIMEOUT_MS = 60 * 1000;

export async function requestHpbSyncWithTimeout(
  path: string,
  init: RequestInit,
  fetchApi: typeof fetch = globalThis.fetch,
  timeoutMs = HPB_SYNC_REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchApi(path, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
