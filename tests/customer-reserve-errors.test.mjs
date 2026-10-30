import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const pageSource = readFileSync(
  new URL("../app/customer-app/reserve/page.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(
  pageSource,
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

function response({ ok = true, body = {} } = {}) {
  return { ok, json: async () => body };
}

async function mount({
  authResponse,
  rejectAuth = false,
  availabilityMode = "success",
  reservationMode = "success",
  storedNotificationRetry = null,
} = {}) {
  const states = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let currentAvailabilityMode = availabilityMode;
  let reservationAttempts = 0;

  const hooks = {
    Suspense: ({ children }) => children,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) {
        states[index] = typeof initial === "function" ? initial() : initial;
      }
      return [states[index], value => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useMemo: fn => fn(),
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useEffect: fn => { effects.push(fn); },
  };

  const fetch = async (url, options = {}) => {
    requests.push({ url, options });

    if (url === "/api/line-login/me") {
      if (rejectAuth) throw new Error("offline");
      return authResponse ?? response({
        body: { authenticated: true, customer: { id: "customer-1" } },
      });
    }

    if (url === "/api/customer-reservations/availability") {
      if (currentAvailabilityMode === "reject") throw new Error("offline");
      if (currentAvailabilityMode === "error") {
        return response({
          ok: false,
          body: { ok: false, error: "空き状況を確認できません" },
        });
      }
      if (currentAvailabilityMode === "empty") {
        return response({ body: { ok: true, staffs: [], slots: [] } });
      }
      return response({
        body: {
          ok: true,
          staffs: [{ id: "staff-1", name: "テスト担当" }],
          slots: [{ time: "10:00", staffIds: ["staff-1"] }],
        },
      });
    }

    if (url === "/api/reservations") {
      reservationAttempts += 1;
      if (reservationMode === "reject") throw new Error("connection lost");
      if (reservationMode === "unknown-json") {
        return {
          ok: true,
          async json() {
            throw new Error("response lost");
          },
        };
      }
      if (reservationMode === "failure") {
        return {
          ok: false,
          status: 409,
          async json() {
            return { ok: false, error: "選択した時間は埋まりました" };
          },
        };
      }
      if (reservationMode === "server-error") {
        return {
          ok: false,
          status: 500,
          async json() {
            return { ok: false, error: "予約保存結果を確認できませんでした" };
          },
        };
      }
      if (
        reservationMode.startsWith("notification-failure-then-") &&
        reservationAttempts === 1
      ) {
        return {
          ok: false,
          status: 503,
          async json() {
            return {
              ok: false,
              error: "予約は保存されましたが、店舗への通知に失敗しました",
              reservationSaved: true,
              notificationRetryable: true,
            };
          },
        };
      }
      if (
        reservationMode === "notification-failure-then-reject-then-success" &&
        reservationAttempts === 2
      ) {
        throw new Error("notification retry response lost");
      }
      if (
        reservationMode === "notification-failure-then-unknown-json-then-success" &&
        reservationAttempts === 2
      ) {
        return {
          ok: true,
          async json() {
            throw new Error("notification retry response lost");
          },
        };
      }
      if (
        reservationMode === "notification-failure-then-server-error-then-success" &&
        reservationAttempts === 2
      ) {
        return {
          ok: false,
          status: 500,
          async json() {
            return { ok: false, error: "通知結果を確認できませんでした" };
          },
        };
      }
      return response({ body: { ok: true, reservation: { id: "reservation-1" } } });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    AbortController,
    Date,
    Intl,
    Map,
    Number,
    Promise,
    URLSearchParams,
    window: {
      setTimeout() {},
      location: { origin: "https://example.test" },
      localStorage: {},
    },
    console: { error() {} },
    fetch,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") {
        return { useSearchParams: () => new URLSearchParams() };
      }
      if (name === "../CustomerPhoto") return { default: () => null };
      if (name === "@/lib/customer-reservation-submission") {
        return {
          buildCustomerReservationFingerprint: value => JSON.stringify(value),
          getOrCreateCustomerReservationOperationId: () =>
            "11111111-1111-4111-8111-111111111111",
          getCustomerReservationNotificationRetry: () =>
            storedNotificationRetry,
          markCustomerReservationNotificationRetryable() {},
          clearCustomerReservationOperation() {},
        };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  }, { filename: "customer-reserve-page.js" });

  function tree() {
    cursor = 0;
    effects.length = 0;
    const wrapper = exports.default();
    return wrapper.props.children.type();
  }

  function html() {
    return renderToStaticMarkup(tree());
  }

  tree();
  const initialEffects = [...effects];
  initialEffects[0]();
  await setImmediate();

  async function selectMenuAndDate() {
    const currentTree = tree();
    const menuSelect = findNode(
      currentTree,
      node =>
        node.type === "select" &&
        [node.props.children]
          .flat(Infinity)
          .some(child => child?.props?.value === "one_color")
    );
    const dateInput = findNode(
      currentTree,
      node => node.type === "input" && node.props.type === "date"
    );
    assert.ok(menuSelect);
    assert.ok(dateInput);
    menuSelect.props.onChange({ target: { value: "one_color" } });
    dateInput.props.onChange({ target: { value: "2026-11-01" } });

    tree();
    const selectedEffects = [...effects];
    selectedEffects[2]();
    await setImmediate();
  }

  return {
    html,
    requests,
    selectMenuAndDate,
    async restoreNotificationRetry() {
      tree();
      const currentEffects = [...effects];
      currentEffects[3]();
      await setImmediate();
    },
    async clickPrimarySubmit() {
      const submitButton = findNode(
        tree(),
        node =>
          node.type === "button" &&
          String(node.props.className || "").includes("mt-4 w-full"),
      );
      assert.ok(submitButton);
      await submitButton.props.onClick();
      await setImmediate();
    },
    async submitReservation() {
      const currentTree = tree();
      const timeSelect = findNode(
        currentTree,
        node =>
          node.type === "select" &&
          [node.props.children]
            .flat(Infinity)
            .some(child => child?.props?.value === "10:00"),
      );
      assert.ok(timeSelect);
      timeSelect.props.onChange({ target: { value: "10:00" } });

      await this.clickPrimarySubmit();
    },
    async recoverAvailability() {
      const retryButton = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "空き時間を再試行"
      );
      assert.ok(retryButton);
      currentAvailabilityMode = "success";
      retryButton.props.onClick();
      tree();
      const retryEffects = [...effects];
      retryEffects[2]();
      await setImmediate();
    },
  };
}

test("reservation creation shows an auth error instead of signed-out guidance after an HTTP failure", async () => {
  const page = await mount({ authResponse: response({ ok: false }) });

  assert.match(page.html(), /role="alert"/);
  assert.match(page.html(), /ログイン状態の確認に失敗しました/);
  assert.doesNotMatch(page.html(), /初めてのお客様は初回入力後/);
});

test("reservation creation shows an auth error after a rejected auth request", async () => {
  const page = await mount({ rejectAuth: true });

  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /LINEでログイン/);
});

test("reservation creation keeps an explicit signed-out response as login guidance", async () => {
  const page = await mount({
    authResponse: response({ body: { authenticated: false } }),
  });

  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /LINEでログイン/);
});

for (const availabilityMode of ["error", "reject"]) {
  test(`reservation creation blocks a false no-availability result after ${availabilityMode}`, async () => {
    const page = await mount({ availabilityMode });
    await page.selectMenuAndDate();

    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(page.html(), /この日は予約可能なスタッフの空きがありません/);
    assert.match(page.html(), /空き時間を再試行/);

    await page.recoverAvailability();
    assert.doesNotMatch(page.html(), /role="alert"/);
    assert.match(page.html(), /10:00/);
  });
}

test("reservation creation preserves an authoritative empty availability result", async () => {
  const page = await mount({ availabilityMode: "empty" });
  await page.selectMenuAndDate();

  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /この日は予約可能なスタッフの空きがありません/);
});

test("customer reservation blocks resubmission after losing a successful response", async () => {
  const page = await mount({ reservationMode: "unknown-json" });
  await page.selectMenuAndDate();
  await page.submitReservation();

  assert.match(page.html(), /予約申請の結果を確認できませんでした/);
  assert.match(page.html(), /マイページで予約を確認/);
  assert.match(page.html(), /マイページで予約を確認してください/);
  assert.equal(page.requests.filter(request => request.url === "/api/reservations").length, 1);

  await page.submitReservation();
  assert.equal(page.requests.filter(request => request.url === "/api/reservations").length, 1);
});

test("customer reservation blocks resubmission after a network result loss", async () => {
  const page = await mount({ reservationMode: "reject" });
  await page.selectMenuAndDate();
  await page.submitReservation();

  assert.match(page.html(), /同じ内容を再送せず/);
  assert.equal(page.requests.filter(request => request.url === "/api/reservations").length, 1);

  await page.submitReservation();
  assert.equal(page.requests.filter(request => request.url === "/api/reservations").length, 1);
});

test("customer reservation allows retry after an authoritative conflict", async () => {
  const page = await mount({ reservationMode: "failure" });
  await page.selectMenuAndDate();
  await page.submitReservation();

  assert.match(page.html(), /選択した時間は埋まりました/);
  assert.doesNotMatch(page.html(), /マイページで予約を確認/);
});

test("customer reservation keeps the operation locked after a server-side unknown result", async () => {
  const page = await mount({ reservationMode: "server-error" });
  await page.selectMenuAndDate();
  await page.submitReservation();

  assert.match(page.html(), /予約申請の結果を確認できませんでした/);
  assert.equal(page.requests.filter(request => request.url === "/api/reservations").length, 1);

  await page.submitReservation();
  assert.equal(page.requests.filter(request => request.url === "/api/reservations").length, 1);
});

test("customer reservation retries a known notification failure with the saved operation", async () => {
  const page = await mount({
    reservationMode: "notification-failure-then-success",
  });
  await page.selectMenuAndDate();
  await page.submitReservation();

  assert.match(page.html(), /予約は保存されています/);
  assert.match(page.html(), /店舗への通知を再試行/);
  assert.doesNotMatch(page.html(), /マイページで予約を確認してください/);

  await page.submitReservation();
  const reservationRequests = page.requests.filter(
    request => request.url === "/api/reservations",
  );
  assert.equal(
    reservationRequests.length,
    2,
  );
  assert.deepEqual(
    JSON.parse(reservationRequests[1].options.body),
    JSON.parse(reservationRequests[0].options.body),
  );
  assert.doesNotMatch(page.html(), /店舗への通知を再試行/);
  assert.match(page.html(), /この内容で予約希望を送る/);
});

test("customer reservation restores a notification retry after a page reload", async () => {
  const submission = {
    menu: "ワンカラー",
    date: "2026-11-01",
    time: "10:00",
    staffId: "staff-1",
    durationMinutes: 90,
    memo: "保存済み予約",
  };
  const operationId = "11111111-1111-4111-8111-111111111111";
  const page = await mount({
    storedNotificationRetry: { submission, operationId },
  });

  await page.restoreNotificationRetry();
  assert.match(page.html(), /ページを再読み込みしても24時間以内/);
  assert.match(page.html(), /店舗への通知を再試行/);

  await page.clickPrimarySubmit();
  const reservationRequests = page.requests.filter(
    request => request.url === "/api/reservations",
  );
  assert.equal(reservationRequests.length, 1);
  assert.deepEqual(JSON.parse(reservationRequests[0].options.body), {
    ...submission,
    operationId,
  });
  assert.doesNotMatch(page.html(), /店舗への通知を再試行/);
});

for (const reservationMode of [
  "notification-failure-then-reject-then-success",
  "notification-failure-then-unknown-json-then-success",
  "notification-failure-then-server-error-then-success",
]) {
  test(`customer reservation keeps the saved notification retry after ${reservationMode}`, async () => {
    const page = await mount({ reservationMode });
    await page.selectMenuAndDate();
    await page.submitReservation();

    await page.submitReservation();
    assert.match(page.html(), /予約は保存済みです/);
    assert.match(page.html(), /店舗通知の結果を確認できなかった/);
    assert.match(page.html(), /店舗への通知を再試行/);
    assert.doesNotMatch(page.html(), /マイページで予約を確認してください/);

    await page.submitReservation();
    const reservationRequests = page.requests.filter(
      request => request.url === "/api/reservations",
    );
    assert.equal(reservationRequests.length, 3);
    assert.deepEqual(
      JSON.parse(reservationRequests[2].options.body),
      JSON.parse(reservationRequests[0].options.body),
    );
    assert.doesNotMatch(page.html(), /店舗への通知を再試行/);
  });
}

test("customer reservation guards the request before React rerenders", () => {
  assert.match(
    pageSource,
    /if \(submissionInFlight\.current \|\| reservationResultUnknown\) return/,
  );
  assert.ok(
    pageSource.indexOf("submissionInFlight.current = true") <
      pageSource.indexOf('fetch("/api/reservations"'),
  );
});
