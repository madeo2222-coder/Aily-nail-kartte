import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
let currentTimeMs = Date.parse("2026-09-29T00:00:00Z");

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [currentTimeMs]));
  }

  static now() {
    return currentTimeMs;
  }
}

const reservationStatusExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../lib/reservation-status.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { exports: reservationStatusExports, Set, String }
);
const confirmationLineRetryExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/reservation-confirmation-line-retry.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { exports: confirmationLineRetryExports, Set }
);
const confirmationEmailRetryExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL(
        "../lib/reservation-confirmation-email-retry.ts",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { exports: confirmationEmailRetryExports, Date: FixedDate }
);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/reservations/ReservationsPageClient.tsx", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
).outputText;

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function mount({
  failureMode = "",
  empty = false,
  reservationStatus = "confirmed",
  reservationSource = null,
  reservationMemo = null,
  confirmFailureMode = "stale",
  statusFailureMode = "success",
  emailResponses = [],
} = {}) {
  currentTimeMs = Date.parse("2026-09-29T00:00:00Z");
  const states = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let collectEffects = true;
  let shouldFail = Boolean(failureMode);
  let currentReservationStatus = reservationStatus;
  const storedValues = new Map();
  const alerts = [];
  const confirmationEmailResponses = [...emailResponses];

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) {
        states[index] = typeof initial === "function" ? initial() : initial;
      }
      return [states[index], value => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useMemo: fn => fn(),
    useEffect: fn => {
      if (collectEffects) effects.push(fn);
    },
  };

  function listBody() {
    if (empty) {
      return { ok: true, reservations: [], customers: [], staffs: [] };
    }

    return {
      ok: true,
      reservations: [{
          id: "reservation-1",
          customer_id: "customer-1",
          staff_id: "staff-1",
          menu: "ワンカラー",
          start_at: "2026-09-29T01:00:00.000Z",
          end_at: "2026-09-29T02:30:00.000Z",
          reservation_date: "2026-09-29",
          reservation_time: "10:00",
          status: currentReservationStatus,
          source: reservationSource,
          memo: reservationMemo,
      }],
      customers: [{ id: "customer-1", name: "顧客A" }],
      staffs: [{ id: "staff-1", name: "黒木" }],
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date: FixedDate,
    Intl,
    Map,
    Number,
    Promise,
    Set,
    URLSearchParams,
    console: { error() {} },
    alert(message) { alerts.push(message); },
    async fetch(url, options = {}) {
      requests.push({ url, options });

      if (url === "/api/reservations/list-data") {
        if (shouldFail && failureMode === "reject") throw new Error("offline");
        if (shouldFail && failureMode === "http") {
          return {
            ok: false,
            async json() { return { ok: false, error: "read failed" }; },
          };
        }
        if (shouldFail && failureMode === "incomplete") {
          return {
            ok: true,
            async json() { return { ok: true, reservations: [] }; },
          };
        }
        return { ok: true, async json() { return listBody(); } };
      }

      if (url === "/api/reservations/reservation-1/status") {
        currentReservationStatus = "来店";
        if (statusFailureMode === "reject") {
          throw new Error("response lost after status commit");
        }
        if (statusFailureMode === "invalid-json") {
          return {
            ok: true,
            status: 200,
            async json() { throw new Error("invalid json"); },
          };
        }
        if (statusFailureMode === "stale") {
          return {
            ok: false,
            status: 409,
            async json() {
              return { ok: false, error: "予約内容が更新されています。" };
            },
          };
        }
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true, reservation: { id: "reservation-1", status: "来店" } };
          },
        };
      }

      if (url === "/api/reservations/reservation-1/confirm") {
        currentReservationStatus = "confirmed";
        if (confirmFailureMode === "reject") {
          throw new Error("response lost after commit");
        }
        if (confirmFailureMode === "invalid-json") {
          return {
            ok: true,
            status: 200,
            async json() { throw new Error("invalid json"); },
          };
        }
        if (confirmFailureMode === "success") {
          return {
            ok: true,
            status: 200,
            async json() {
              return { ok: true, confirmed: true };
            },
          };
        }
        return {
          ok: false,
          status: 409,
          async json() {
            return { ok: false, error: "予約内容が更新されています。" };
          },
        };
      }

      if (url === "/api/send-reservation-confirmed-line") {
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true, sent: true };
          },
        };
      }

      if (url === "/api/send-reservation-confirmed-email") {
        const configured = confirmationEmailResponses.shift();
        if (configured instanceof Error) throw configured;
        if (configured) {
          return {
            ok: configured.ok,
            status: configured.status,
            async json() { return configured.body; },
          };
        }
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              ok: true,
              sent: true,
              message: "予約確定メールを送信しました。",
            };
          },
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    },
    window: {
      confirm: () => true,
      history: { replaceState() {} },
      localStorage: {
        getItem(key) { return storedValues.get(key) ?? null; },
        setItem(key, value) { storedValues.set(key, value); },
        removeItem(key) { storedValues.delete(key); },
      },
      requestAnimationFrame(callback) { callback(); },
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") {
        return { useSearchParams: () => ({ get: () => null }) };
      }
      if (name === "react/jsx-runtime") return require(name);
      if (name === "./ReservationReferencePhoto") {
        return { default: () => null };
      }
      if (name === "@/lib/reservation-status") return reservationStatusExports;
      if (name === "@/lib/reservation-confirmation-line-retry") {
        return confirmationLineRetryExports;
      }
      if (name === "@/lib/reservation-confirmation-email-retry") {
        return confirmationEmailRetryExports;
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function tree() {
    cursor = 0;
    return exports.default();
  }

  function html() {
    return renderToStaticMarkup(tree());
  }

  assert.match(html(), /読み込み中/);
  collectEffects = false;
  effects[0]();
  await setImmediate();

  return {
    requests,
    html,
    hasButton(label) {
      return Boolean(
        findNode(
          tree(),
          node => node.type === "button" && node.props.children === label
        )
      );
    },
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button, "retry button exists");
      shouldFail = false;
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
    async markVisited() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "来店にする"
      );
      assert.ok(button, "mark visited button exists");
      await button.props.onClick();
      await setImmediate();
    },
    async confirmReservation() {
      const button = findNode(
        tree(),
        node =>
          node.type === "button" &&
          node.props.children === "予約確定・通知送信"
      );
      assert.ok(button, "confirm reservation button exists");
      await button.props.onClick();
      await setImmediate();
    },
    async confirmReservationTwice() {
      const button = findNode(
        tree(),
        node =>
          node.type === "button" &&
          node.props.children === "予約確定・通知送信"
      );
      assert.ok(button, "confirm reservation button exists");
      await Promise.all([button.props.onClick(), button.props.onClick()]);
      await setImmediate();
    },
    setConfirmationLineLock(kind = "sent") {
      storedValues.set(
        "aily:confirmation-line-retry-lock:v1:reservation-1",
        JSON.stringify({ version: 1, savedAt: Date.now(), kind })
      );
    },
    async retryConfirmationLine() {
      const button = findNode(
        tree(),
        node =>
          node.type === "button" &&
          node.props.children === "確定LINEを再試行"
      );
      assert.ok(button, "confirmation LINE retry button exists");
      await button.props.onClick();
      await setImmediate();
    },
    async retryConfirmationEmail(label = "確定メールを再試行") {
      const button = findNode(
        tree(),
        node =>
          node.type === "button" &&
          node.props.children === label
      );
      assert.ok(button, "confirmation email retry button exists");
      await button.props.onClick();
      await setImmediate();
    },
    advanceTime(hours) {
      currentTimeMs += hours * 60 * 60 * 1000;
    },
    alerts,
  };
}

for (const failureMode of ["http", "incomplete", "reject"]) {
  test(`reservation list hides incomplete data after ${failureMode} API failure`, async () => {
    const page = await mount({ failureMode });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(
      page.html(),
      /0件|条件に合う予約はありません|重複は見つかっていません|顧客A|黒木/
    );
    assert.equal(page.requests[0].url, "/api/reservations/list-data");
  });
}

test("reservation list recovers after retry", async () => {
  const page = await mount({ failureMode: "http" });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /黒木/);
  assert.match(page.html(), /ワンカラー/);
});

test("reservation list updates visit status through the authenticated API", async () => {
  const page = await mount();
  await page.markVisited();

  const statusRequest = page.requests.find(
    request => request.url === "/api/reservations/reservation-1/status"
  );
  assert.ok(statusRequest);
  assert.equal(statusRequest.options.method, "POST");
  assert.deepEqual(JSON.parse(statusRequest.options.body), {
    status: "来店",
    expectedCustomerId: "customer-1",
    expectedStatus: "confirmed",
  });
});

for (const statusFailureMode of ["reject", "invalid-json"]) {
  test(`reservation list reloads authoritative status after ${statusFailureMode} status result`, async () => {
    const page = await mount({ statusFailureMode });
    await page.markVisited();

    assert.equal(
      page.requests.filter(
        request => request.url === "/api/reservations/list-data"
      ).length,
      2
    );
    assert.equal(page.hasButton("来店にする"), false);
    assert.equal(page.hasButton("完了にする"), true);
    assert.match(
      page.alerts.at(-1),
      /予約ステータス更新の結果を確認できませんでした/
    );
  });
}

test("reservation list refreshes stale status conflicts", async () => {
  const page = await mount({ statusFailureMode: "stale" });
  await page.markVisited();

  assert.equal(
    page.requests.filter(
      request => request.url === "/api/reservations/list-data"
    ).length,
    2
  );
  assert.equal(page.hasButton("来店にする"), false);
  assert.equal(page.hasButton("完了にする"), true);
  assert.match(page.alerts.at(-1), /予約内容が更新されています/);
});

test("reservation list keeps workflow actions visible for normalized status aliases", async () => {
  const confirmed = await mount({ reservationStatus: " ＣＯＮＦＩＲＭＥＤ " });
  assert.match(confirmed.html(), /予約確定/);
  assert.equal(confirmed.hasButton("来店にする"), true);

  const visited = await mount({ reservationStatus: " 来 店 予 定 " });
  assert.match(visited.html(), /来店予定/);
  assert.equal(visited.hasButton("完了にする"), true);
});

test("reservation list confirms against the displayed reservation snapshot", async () => {
  const page = await mount({ reservationStatus: "requested" });
  await page.confirmReservation();

  const confirmRequest = page.requests.find(
    request => request.url === "/api/reservations/reservation-1/confirm"
  );
  assert.ok(confirmRequest);
  assert.equal(confirmRequest.options.method, "POST");
  assert.deepEqual(JSON.parse(confirmRequest.options.body), {
    expectedCustomerId: "customer-1",
    expectedStaffId: "staff-1",
    expectedMenu: "ワンカラー",
    expectedStartAt: "2026-09-29T01:00:00.000Z",
    expectedEndAt: "2026-09-29T02:30:00.000Z",
    expectedStatus: "requested",
    expectedMemo: null,
  });
});

test("reservation list sends LINE and email only after confirmation succeeds", async () => {
  const page = await mount({
    reservationStatus: "requested",
    confirmFailureMode: "success",
  });
  await page.confirmReservation();

  const urls = page.requests.map(request => request.url);
  const confirmIndex = urls.indexOf("/api/reservations/reservation-1/confirm");
  const lineIndex = urls.indexOf("/api/send-reservation-confirmed-line");
  const emailIndex = urls.indexOf("/api/send-reservation-confirmed-email");
  assert.ok(confirmIndex >= 0);
  assert.ok(lineIndex > confirmIndex);
  assert.ok(emailIndex > lineIndex);
  assert.match(page.alerts.at(-1), /LINE通知を送信しました/);
  assert.match(page.alerts.at(-1), /予約確定メールを送信しました/);
});

test("reservation list offers one same-screen email retry after a transient failure", async () => {
  const page = await mount({
    reservationStatus: "requested",
    confirmFailureMode: "success",
    emailResponses: [
      {
        ok: false,
        status: 502,
        body: {
          ok: false,
          sent: false,
          retryable: true,
          retryWindowHours: 24,
          message: "24時間以内に再試行できます。",
        },
      },
      {
        ok: true,
        status: 200,
        body: {
          ok: true,
          sent: true,
          message: "予約確定メールを送信しました。",
        },
      },
    ],
  });

  await page.confirmReservation();
  assert.equal(page.hasButton("確定メールを再試行"), true);
  assert.match(page.alerts.at(-1), /24時間以内/);
  assert.match(page.html(), /24時間以内に再試行できます/);

  await page.retryConfirmationEmail();
  assert.equal(page.hasButton("確定メールを再試行"), false);
  assert.doesNotMatch(page.html(), /24時間以内に再試行できます/);
  assert.match(page.alerts.at(-1), /予約確定メールを送信しました/);
  assert.equal(
    page.requests.filter(
      request => request.url === "/api/send-reservation-confirmed-email"
    ).length,
    2
  );
});

test("reservation list removes an expired email retry without calling the API", async () => {
  const page = await mount({
    reservationStatus: "requested",
    confirmFailureMode: "success",
    emailResponses: [
      {
        ok: false,
        status: 502,
        body: {
          ok: false,
          sent: false,
          retryable: true,
          retryWindowHours: 24,
          message: "24時間以内に再試行できます。",
        },
      },
    ],
  });

  await page.confirmReservation();
  assert.equal(page.hasButton("確定メールを再試行"), true);
  const emailRequestCount = page.requests.filter(
    request => request.url === "/api/send-reservation-confirmed-email"
  ).length;

  page.advanceTime(25);
  await page.retryConfirmationEmail();

  assert.equal(page.hasButton("確定メールを再試行"), false);
  assert.match(page.html(), /送信履歴を確認/);
  assert.match(page.alerts.at(-1), /送信履歴を確認/);
  assert.equal(
    page.requests.filter(
      request => request.url === "/api/send-reservation-confirmed-email"
    ).length,
    emailRequestCount
  );
});

test("reservation list ignores a second confirmation click while the first is pending", async () => {
  const page = await mount({ reservationStatus: "requested" });
  await page.confirmReservationTwice();

  assert.equal(
    page.requests.filter(
      request => request.url === "/api/reservations/reservation-1/confirm"
    ).length,
    1
  );
});

for (const confirmFailureMode of ["reject", "invalid-json"]) {
  test(`reservation list reloads authoritative status after ${confirmFailureMode} confirmation result`, async () => {
    const page = await mount({
      reservationStatus: "requested",
      confirmFailureMode,
    });
    await page.confirmReservation();

    assert.equal(
      page.requests.filter(
        request => request.url === "/api/reservations/list-data"
      ).length,
      2
    );
    assert.equal(page.hasButton("予約確定・通知送信"), false);
    assert.equal(page.hasButton("確定LINEを再試行"), true);
    assert.equal(page.hasButton("確定メールを送信"), true);
    assert.equal(
      page.requests.some(
        request => request.url === "/api/send-reservation-confirmed-line"
      ),
      false
    );
    assert.match(page.alerts.at(-1), /予約確定の結果を確認できませんでした/);

    await page.retryConfirmationEmail("確定メールを送信");
    assert.equal(page.hasButton("確定メールを送信"), false);
    assert.equal(
      page.requests.filter(
        request => request.url === "/api/send-reservation-confirmed-email"
      ).length,
      1
    );
  });
}

test("reservation list expires unknown-confirmation email recovery without sending", async () => {
  const page = await mount({
    reservationStatus: "requested",
    confirmFailureMode: "reject",
  });
  await page.confirmReservation();
  assert.equal(page.hasButton("確定メールを送信"), true);

  page.advanceTime(25);
  await page.retryConfirmationEmail("確定メールを送信");

  assert.equal(page.hasButton("確定メールを送信"), false);
  assert.match(page.alerts.at(-1), /送信履歴を確認/);
  assert.equal(
    page.requests.some(
      request => request.url === "/api/send-reservation-confirmed-email"
    ),
    false
  );
});

test("reservation list refreshes stale confirmation conflicts", async () => {
  const page = await mount({ reservationStatus: "requested" });
  await page.confirmReservation();

  assert.equal(
    page.requests.filter(
      request => request.url === "/api/reservations/list-data"
    ).length,
    2
  );
  assert.equal(page.hasButton("予約確定・通知送信"), false);
  assert.equal(page.hasButton("確定LINEを再試行"), true);
  assert.match(page.alerts.at(-1), /予約内容が更新されています/);
});

test("reservation list rechecks a cross-tab LINE lock before retrying", async () => {
  const page = await mount({ reservationStatus: "confirmed" });
  page.setConfirmationLineLock();
  await page.retryConfirmationLine();

  assert.match(page.alerts.at(-1), /送信済み/);
  assert.equal(
    page.requests.some(
      request => request.url === "/api/send-reservation-confirmed-line"
    ),
    false
  );
  assert.equal(page.hasButton("確定LINEを再試行"), false);
});

test("reservation list preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /0件/);
  assert.match(page.html(), /条件に合う予約はありません/);
});

test("reservation list renders complete successful data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /黒木/);
  assert.match(page.html(), /ワンカラー/);
  assert.match(
    page.html(),
    /reservation_status=confirmed/,
  );
});

test("reservation list hides Naily confirmation actions for customer-linked external syncs", async () => {
  const confirmed = await mount({
    reservationStatus: "confirmed",
    reservationSource: "ｍｉｎｉｍｏ",
  });
  assert.equal(confirmed.hasButton("確定LINEを再試行"), false);

  const requested = await mount({
    reservationStatus: "requested",
    reservationMemo: "ＨＰＢ予約番号：AB-123",
  });
  assert.equal(requested.hasButton("予約確定・通知送信"), false);
});
