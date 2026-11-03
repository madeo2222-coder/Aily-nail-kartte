import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadRetryLockModule() {
  const source = readFileSync(
    new URL("../lib/reservation-confirmation-line-retry.ts", import.meta.url),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    AbortController,
    clearTimeout,
    exports,
    fetch,
    require,
    Set,
    Date,
    JSON,
    Number,
    setTimeout,
  });
  return exports;
}

const {
  ALTERNATIVE_LINE_IN_PROGRESS_LOCK_TTL_MS,
  ALTERNATIVE_LINE_RETRY_LOCK_TTL_MS,
  CONFIRMATION_LINE_IN_PROGRESS_LOCK_TTL_MS,
  CONFIRMATION_LINE_RETRY_LOCK_TTL_MS,
  RESERVATION_LINE_REQUEST_TIMEOUT_MS,
  claimAlternativeLineInProgressLock,
  claimConfirmationLineInProgressLock,
  createAlternativeLineReservationRevision,
  getAlternativeLineInProgressLock,
  getAlternativeLineRetryLock,
  getConfirmationLineInProgressLock,
  getConfirmationLineRetryLock,
  readAlternativeLineRetryLock,
  readConfirmationLineRetryLock,
  requestReservationLineWithTimeout,
  saveAlternativeLineRetryLock,
  saveConfirmationLineRetryLock,
} = loadRetryLockModule();

test("reservation LINE requests stop waiting before the browser stays stuck", async () => {
  let requestSignal;
  let requestBody;
  const neverResponds = (_url, options) => {
    requestSignal = options.signal;
    requestBody = JSON.parse(options.body);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(new Error("request aborted"));
      });
    });
  };

  await assert.rejects(
    requestReservationLineWithTimeout(
      "/api/send-reservation-confirmed-line",
      { reservationId: "reservation-1" },
      neverResponds,
      5
    ),
    /request aborted/
  );

  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(requestBody, { reservationId: "reservation-1" });
  assert.equal(RESERVATION_LINE_REQUEST_TIMEOUT_MS, 15_000);
});

function createAlternativeSnapshot(overrides = {}) {
  return {
    customerId: "customer-1",
    staffId: "staff-1",
    menu: "ワンカラー",
    startAt: "2026-11-01T01:00:00.000Z",
    endAt: "2026-11-01T02:30:00.000Z",
    status: "requested",
    memo: "お客様メモ",
    ...overrides,
  };
}

function createMemoryStorage() {
  const entries = new Map();

  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
    removeItem(key) {
      entries.delete(key);
    },
    entries,
  };
}

test("blocks an immediate retry when the browser cannot read the LINE result", () => {
  const lock = getConfirmationLineRetryLock(null);
  assert.equal(lock.kind, "history_check");
  assert.match(lock.message, /同じ送信を繰り返さず/);
});

test("keeps retry available only for a recorded retryable failure", () => {
  assert.equal(
    getConfirmationLineRetryLock({
      ok: false,
      status: "failed",
      retryable: true,
      error: "再試行できます。",
    }),
    null
  );
  assert.equal(
    getConfirmationLineRetryLock({
      ok: false,
      status: "not_linked",
      error: "LINE連携がありません。",
    }),
    null
  );
});

test("blocks retry when the server requires delivery-history confirmation", () => {
  for (const status of [
    "unknown",
    "sent_unrecorded",
    "retry_expired",
    "message_changed",
  ]) {
    const lock = getConfirmationLineRetryLock({
      ok: false,
      status,
      retryable: status === "unknown" ? false : undefined,
      error: `${status}: 履歴を確認してください。`,
    });
    assert.equal(lock.kind, "history_check", status);
    assert.match(lock.message, /履歴を確認/, status);
  }
});

test("removes retry after a known successful or already completed send", () => {
  assert.equal(
    getConfirmationLineRetryLock({ ok: true, sent: true }).kind,
    "sent"
  );
  assert.equal(
    getConfirmationLineRetryLock({ ok: true, alreadySent: true }).kind,
    "sent"
  );
});

test("restores a retry lock after a page reload within the retry window", () => {
  const storage = createMemoryStorage();
  const lock = {
    kind: "history_check",
    message: "通知履歴を確認してください。",
  };

  saveConfirmationLineRetryLock(storage, "reservation-1", lock, 1_000);

  const restored = readConfirmationLineRetryLock(
    storage,
    "reservation-1",
    2_000
  );
  assert.equal(restored.kind, "history_check");
  assert.match(restored.message, /同じ送信を繰り返さず/);
  assert.doesNotMatch([...storage.entries.values()][0], /通知履歴/);
});

test("confirmation LINE waits out an in-progress delivery across reloads", () => {
  const storage = createMemoryStorage();
  const lock = getConfirmationLineInProgressLock(1_000);

  assert.equal(lock.kind, "wait");
  assert.equal(
    lock.retryAt,
    1_000 + CONFIRMATION_LINE_IN_PROGRESS_LOCK_TTL_MS
  );

  saveConfirmationLineRetryLock(storage, "reservation-1", lock, 1_000);
  assert.equal(
    readConfirmationLineRetryLock(
      storage,
      "reservation-1",
      1_000 + CONFIRMATION_LINE_IN_PROGRESS_LOCK_TTL_MS - 1
    ).kind,
    "wait"
  );
  assert.equal(
    readConfirmationLineRetryLock(
      storage,
      "reservation-1",
      1_000 + CONFIRMATION_LINE_IN_PROGRESS_LOCK_TTL_MS
    ),
    null
  );

  const serverLock = getConfirmationLineRetryLock(
    { ok: false, status: "in_progress" },
    2_000
  );
  assert.equal(serverLock.kind, "wait");
  assert.equal(
    serverLock.retryAt,
    2_000 + CONFIRMATION_LINE_IN_PROGRESS_LOCK_TTL_MS
  );
});

test("confirmation LINE claim proceeds only for the tab that still owns the lock", async () => {
  const storage = createMemoryStorage();
  const now = Date.now();
  const firstAttemptId = "11111111-1111-4111-8111-111111111111";
  const secondAttemptId = "22222222-2222-4222-8222-222222222222";
  let releaseClaim;

  const firstClaim = claimConfirmationLineInProgressLock(
    storage,
    "reservation-1",
    firstAttemptId,
    now,
    () =>
      new Promise((resolve) => {
        releaseClaim = resolve;
      })
  );
  saveConfirmationLineRetryLock(
    storage,
    "reservation-1",
    getConfirmationLineInProgressLock(now, secondAttemptId),
    now
  );
  releaseClaim();

  const result = await firstClaim;
  assert.equal(result.acquired, false);
  assert.equal(result.lock.kind, "wait");
  assert.equal(result.lock.attemptId, secondAttemptId);
});

test("confirmation LINE claim keeps the current-screen guard when storage is unavailable", async () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  const attemptId = "33333333-3333-4333-8333-333333333333";
  const result = await claimConfirmationLineInProgressLock(
    unavailableStorage,
    "reservation-1",
    attemptId,
    1_000,
    async () => {}
  );

  assert.equal(result.acquired, true);
  assert.equal(result.lock.kind, "wait");
  assert.equal(result.lock.attemptId, attemptId);
});

test("clears retryable, expired, and malformed stored locks", () => {
  const storage = createMemoryStorage();
  const lock = { kind: "sent", message: "送信済みです。" };

  saveConfirmationLineRetryLock(storage, "reservation-1", lock, 1_000);
  saveConfirmationLineRetryLock(storage, "reservation-1", null, 2_000);
  assert.equal(
    readConfirmationLineRetryLock(storage, "reservation-1", 3_000),
    null
  );

  saveConfirmationLineRetryLock(storage, "reservation-2", lock, 1_000);
  assert.equal(
    readConfirmationLineRetryLock(
      storage,
      "reservation-2",
      1_000 + CONFIRMATION_LINE_RETRY_LOCK_TTL_MS
    ),
    null
  );

  storage.setItem(
    "aily:confirmation-line-retry-lock:v1:reservation-3",
    "not-json"
  );
  assert.equal(
    readConfirmationLineRetryLock(storage, "reservation-3", 3_000),
    null
  );
  assert.equal(storage.entries.size, 0);
});

test("storage failures do not replace the current screen's in-memory guard", () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };

  assert.doesNotThrow(() =>
    saveConfirmationLineRetryLock(
      unavailableStorage,
      "reservation-1",
      getConfirmationLineRetryLock(null),
      1_000
    )
  );
  assert.equal(
    readConfirmationLineRetryLock(unavailableStorage, "reservation-1", 2_000),
    null
  );
});

test("alternative-time LINE delivery persists sent and unknown-result locks", () => {
  const storage = createMemoryStorage();

  const sentLock = getAlternativeLineRetryLock({ ok: true, sent: true });
  assert.equal(sentLock.kind, "sent");
  assert.match(sentLock.message, /別日時入力のLINEを送信/);
  saveAlternativeLineRetryLock(
    storage,
    "reservation-1",
    "revision-1",
    sentLock,
    1_000
  );
  assert.equal(
    readAlternativeLineRetryLock(
      storage,
      "reservation-1",
      "revision-1",
      2_000
    ).kind,
    "sent"
  );

  const unknownLock = getAlternativeLineRetryLock(null);
  assert.equal(unknownLock.kind, "history_check");
  assert.match(unknownLock.message, /同じ送信を繰り返さず/);
  saveAlternativeLineRetryLock(
    storage,
    "reservation-2",
    "revision-2",
    unknownLock,
    1_000
  );
  assert.equal(
    readAlternativeLineRetryLock(
      storage,
      "reservation-2",
      "revision-2",
      2_000
    ).kind,
    "history_check"
  );
  assert.equal(
    readAlternativeLineRetryLock(
      storage,
      "reservation-2",
      "revision-2",
      1_000 + ALTERNATIVE_LINE_RETRY_LOCK_TTL_MS
    ),
    null
  );
});

test("alternative-time LINE lock clears when the reservation revision changes", () => {
  const storage = createMemoryStorage();
  const lock = getAlternativeLineRetryLock({ ok: true, sent: true });

  saveAlternativeLineRetryLock(
    storage,
    "reservation-1",
    "revision-before-customer-change",
    lock,
    1_000
  );

  assert.equal(
    readAlternativeLineRetryLock(
      storage,
      "reservation-1",
      "revision-after-customer-change",
      2_000
    ),
    null
  );
  assert.equal(storage.entries.size, 0);
});

test("alternative-time revision follows every guarded reservation field", () => {
  const original = createAlternativeSnapshot();
  const revision = createAlternativeLineReservationRevision(original);

  assert.equal(
    createAlternativeLineReservationRevision({ ...original }),
    revision
  );
  for (const [field, value] of [
    ["customerId", "customer-2"],
    ["staffId", "staff-2"],
    ["menu", "フレンチ"],
    ["startAt", "2026-11-01T03:00:00.000Z"],
    ["endAt", "2026-11-01T04:30:00.000Z"],
    ["status", "confirmed"],
    ["memo", "更新後メモ"],
  ]) {
    assert.notEqual(
      createAlternativeLineReservationRevision(
        createAlternativeSnapshot({ [field]: value })
      ),
      revision,
      field
    );
  }
  assert.doesNotMatch(revision, /customer-1|お客様メモ/);
});

test("alternative-time lock clears after a guarded field changes even without an updated-at change", () => {
  const storage = createMemoryStorage();
  const beforeRevision = createAlternativeLineReservationRevision(
    createAlternativeSnapshot()
  );
  const afterRevision = createAlternativeLineReservationRevision(
    createAlternativeSnapshot({ menu: "フレンチ" })
  );

  saveAlternativeLineRetryLock(
    storage,
    "reservation-1",
    beforeRevision,
    getAlternativeLineRetryLock({ ok: true, sent: true }),
    1_000
  );

  assert.equal(
    readAlternativeLineRetryLock(
      storage,
      "reservation-1",
      afterRevision,
      2_000
    ),
    null
  );
});

test("alternative-time LINE conservatively migrates the legacy lock", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "aily:alternative-line-retry-lock:v1:reservation-1",
    JSON.stringify({ version: 1, savedAt: 1_000, kind: "sent" })
  );

  assert.equal(
    readAlternativeLineRetryLock(
      storage,
      "reservation-1",
      "revision-1",
      2_000
    ).kind,
    "sent"
  );
  assert.equal(storage.entries.size, 1);
  assert.ok(
    storage.entries.has("aily:alternative-line-retry-lock:v2:reservation-1")
  );
  assert.equal(
    storage.entries.has("aily:alternative-line-retry-lock:v1:reservation-1"),
    false
  );
});

test("alternative-time LINE keeps only recorded retryable failures available", () => {
  assert.equal(
    getAlternativeLineRetryLock({
      ok: false,
      status: "failed",
      retryable: true,
      error: "再試行できます。",
    }),
    null
  );

  for (const status of ["unknown", "sent_unrecorded", "retry_expired"]) {
    assert.equal(
      getAlternativeLineRetryLock({
        ok: false,
        status,
        retryable: false,
        error: "送信履歴を確認してください。",
      }).kind,
      "history_check"
    );
  }
});

test("alternative-time LINE waits out an in-progress delivery without repeated clicks", () => {
  const storage = createMemoryStorage();
  const lock = getAlternativeLineRetryLock(
    {
      ok: false,
      status: "in_progress",
      retryAfterSeconds: 300,
      error: "別の送信処理が進行中です。",
    },
    1_000
  );

  assert.equal(lock.kind, "wait");
  assert.equal(
    lock.retryAt,
    1_000 + ALTERNATIVE_LINE_IN_PROGRESS_LOCK_TTL_MS
  );

  saveAlternativeLineRetryLock(
    storage,
    "reservation-1",
    "revision-1",
    lock,
    1_000
  );
  assert.equal(
    readAlternativeLineRetryLock(
      storage,
      "reservation-1",
      "revision-1",
      1_000 + ALTERNATIVE_LINE_IN_PROGRESS_LOCK_TTL_MS - 1
    ).kind,
    "wait"
  );
  assert.equal(
    readAlternativeLineRetryLock(
      storage,
      "reservation-1",
      "revision-1",
      1_000 + ALTERNATIVE_LINE_IN_PROGRESS_LOCK_TTL_MS
    ),
    null
  );
});

test("alternative-time LINE claim proceeds only for the tab that still owns the revision lock", async () => {
  const storage = createMemoryStorage();
  const now = Date.now();
  const firstAttemptId = "11111111-1111-4111-8111-111111111111";
  const secondAttemptId = "22222222-2222-4222-8222-222222222222";
  let releaseClaim;

  const firstClaim = claimAlternativeLineInProgressLock(
    storage,
    "reservation-1",
    "revision-1",
    firstAttemptId,
    now,
    () =>
      new Promise((resolve) => {
        releaseClaim = resolve;
      })
  );
  saveAlternativeLineRetryLock(
    storage,
    "reservation-1",
    "revision-1",
    getAlternativeLineInProgressLock(now, secondAttemptId),
    now
  );
  releaseClaim();

  const result = await firstClaim;
  assert.equal(result.acquired, false);
  assert.equal(result.lock.kind, "wait");
  assert.equal(result.lock.attemptId, secondAttemptId);
});

test("alternative-time LINE claim keeps the current-screen guard when storage is unavailable", async () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  const attemptId = "33333333-3333-4333-8333-333333333333";
  const result = await claimAlternativeLineInProgressLock(
    unavailableStorage,
    "reservation-1",
    "revision-1",
    attemptId,
    1_000,
    async () => {}
  );

  assert.equal(result.acquired, true);
  assert.equal(result.lock.kind, "wait");
  assert.equal(result.lock.attemptId, attemptId);
});

test("both staff reservation screens apply the shared retry lock", () => {
  const listPage = readFileSync(
    new URL("../app/reservations/ReservationsPageClient.tsx", import.meta.url),
    "utf8"
  );
  const editPage = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  for (const source of [listPage, editPage]) {
    assert.match(source, /getConfirmationLineRetryLock\(result|lineData|null/);
    assert.match(source, /confirmationLineRetryLock/);
    assert.match(source, /確定LINEを再試行/);
    assert.match(
      source,
      /readConfirmationLineRetryLock\([\s\S]{0,80}window\.localStorage/
    );
    assert.match(source, /saveConfirmationLineRetryLock\(/);
    assert.match(source, /claimConfirmationLineInProgressLock\(/);
    assert.match(source, /if \(!claim\.acquired\)/);
  }
  for (const source of [listPage, editPage]) {
    const lockIndex = source.indexOf("claimConfirmationLineInProgressLock(");
    const ownerIndex = source.indexOf("if (!claim.acquired)", lockIndex);
    const fetchIndex = source.indexOf(
      'requestReservationLineWithTimeout(',
      lockIndex
    );
    assert.ok(lockIndex >= 0, "confirmation LINE lock is claimed");
    assert.ok(
      ownerIndex > lockIndex && fetchIndex > ownerIndex,
      "the owner is confirmed before the LINE request"
    );
  }
  assert.match(
    listPage,
    /canRetryConfirmationLine\(item\.status\) &&[\s\S]{0,80}!isExternalSynced \? \([\s\S]{0,120}confirmationLineRetryLocks\[item\.id\] \?/
  );
  assert.match(editPage, /!confirmationLineRetryLock/);
  assert.match(
    listPage,
    /window\.addEventListener\("storage", refreshConfirmationLineRetryLocks\)[\s\S]{0,500}confirmationLineWaitRetryAt - Date\.now\(\)/
  );
  assert.match(
    editPage,
    /window\.addEventListener\("storage", refreshConfirmationLineRetryLock\)[\s\S]{0,500}confirmationLineWaitRetryAt - Date\.now\(\)/
  );
  assert.match(
    listPage,
    /window\.removeEventListener\([\s\S]{0,100}"storage",[\s\S]{0,100}refreshConfirmationLineRetryLocks[\s\S]{0,150}window\.clearTimeout\(timeoutId\)/
  );
  assert.match(
    editPage,
    /window\.removeEventListener\([\s\S]{0,100}"storage",[\s\S]{0,100}refreshConfirmationLineRetryLock[\s\S]{0,150}window\.clearTimeout\(timeoutId\)/
  );
});

test("reservation edit exposes confirmation only for customer requests", () => {
  const editPage = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    editPage,
    /const canConfirmCurrentReservation =\s*!isExternalBlock &&\s*!isExternalSynced &&\s*isRequestedReservationStatus\(status\)/
  );
  assert.match(
    editPage,
    /async function handleConfirmReservation\(\)[\s\S]{0,900}if \(isExternalBlock\)[\s\S]{0,300}if \(isExternalSynced\)[\s\S]{0,300}if \(!isRequestedReservationStatus\(status\)\)/
  );
  assert.match(
    editPage,
    /canConfirmCurrentReservation \? \([\s\S]{0,500}予約確定にする/
  );
  assert.match(editPage, /外部予定は予約確定の対象外です/);
  assert.match(
    editPage,
    /isProgressedReservation \? \([\s\S]{0,300}\{getStatusLabel\(status\)\}の予約です/
  );
});

test("staff edit screen blocks unsafe alternative-time LINE repeats across reloads", () => {
  const editPage = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(editPage, /getAlternativeLineRetryLock\(result|null\)/);
  assert.match(
    editPage,
    /readAlternativeLineRetryLock\([\s\S]{0,120}window\.localStorage,[\s\S]{0,80}reservationId,[\s\S]{0,80}initialAlternativeRevision/
  );
  assert.match(editPage, /createAlternativeLineReservationRevision\(/);
  assert.doesNotMatch(
    editPage,
    /readAlternativeLineRetryLock\([\s\S]{0,120}reservation\.updated_at/
  );
  assert.match(editPage, /saveAlternativeLineRetryLock\(/);
  assert.match(editPage, /claimAlternativeLineInProgressLock\(/);
  const claimIndex = editPage.indexOf("claimAlternativeLineInProgressLock(");
  const ownerIndex = editPage.indexOf("if (!claim.acquired)", claimIndex);
  const fetchIndex = editPage.indexOf("request-alternative`,", claimIndex);
  assert.ok(claimIndex >= 0, "alternative LINE lock is claimed");
  assert.ok(
    ownerIndex > claimIndex && fetchIndex > ownerIndex,
    "the alternative LINE owner is confirmed before the request"
  );
  assert.match(
    editPage,
    /alternativeLineRetryLock\?\.kind !== "wait"[\s\S]{0,900}window\.setTimeout\(clearWaitLock, remainingMs\)/
  );
  assert.match(
    editPage,
    /window\.addEventListener\("storage", refreshAlternativeLineRetryLock\)[\s\S]{0,260}window\.removeEventListener\("storage", refreshAlternativeLineRetryLock\)/
  );
  assert.match(
    editPage,
    /const refreshAlternativeLineRetryLock = \(\) => \{[\s\S]{0,260}readAlternativeLineRetryLock\([\s\S]{0,120}window\.localStorage,[\s\S]{0,80}reservationId,[\s\S]{0,80}initialAlternativeRevision/
  );
  assert.match(
    editPage,
    /const expiredMessage = alternativeLineRetryLock\.message;[\s\S]{0,600}setErrorMessage\(\(current\) =>[\s\S]{0,100}current === expiredMessage \? "" : current[\s\S]{0,150}setSuccessMessage\(\(current\) =>[\s\S]{0,100}current === expiredMessage \? "" : current/
  );
  assert.match(
    editPage,
    /alternativeLineRetryLock \? \([\s\S]{0,1400}別日時をLINEで依頼/
  );
});

test("external synced reservation edit screen is read-only before any mutation request", () => {
  const editPage = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    editPage,
    /async function handleSubmit[\s\S]{0,220}if \(isExternalSynced\) \{[\s\S]{0,180}予約元で変更・キャンセルしてください。[\s\S]{0,40}return;/
  );
  assert.match(
    editPage,
    /async function handleDelete[\s\S]{0,180}if \(isExternalSynced\) \{[\s\S]{0,180}予約元で変更・キャンセルしてください。[\s\S]{0,40}return;/
  );
  assert.match(
    editPage,
    /<fieldset disabled=\{isExternalSynced\} className="grid gap-4">/
  );
  assert.match(
    editPage,
    /isExternalSynced \? \([\s\S]{0,280}閲覧専用：予約の変更・確定・キャンセルは予約元で行ってください/
  );
  assert.match(
    editPage,
    /status === "キャンセル" &&[\s\S]{0,100}!isExternalSynced &&/
  );
  assert.match(editPage, /href="\/reservations"[\s\S]{0,180}予約一覧で来店・完了を操作/);
  assert.match(editPage, /来店・完了はAilyの予約一覧から操作できます/);
});
