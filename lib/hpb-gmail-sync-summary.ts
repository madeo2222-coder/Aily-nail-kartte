export type GmailSyncResult = {
  skipped?: boolean;
  ok?: boolean;
};

export function summarizeGmailSyncResults(results: GmailSyncResult[]) {
  const skippedCount = results.filter((result) => result.skipped).length;
  const syncedCount = results.filter(
    (result) => !result.skipped && result.ok
  ).length;
  const failedCount = results.length - skippedCount - syncedCount;

  return {
    processedCount: results.length,
    syncedCount,
    skippedCount,
    failedCount,
  };
}
