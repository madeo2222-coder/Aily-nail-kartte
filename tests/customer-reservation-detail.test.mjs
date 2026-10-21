// Run: node --test tests/customer-reservation-detail.test.mjs
// Executes the real page's initial fetch/render flow with in-memory HTTP responses.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
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
const source = readFileSync(
  new URL("../app/customer-app/reservations/[id]/page.tsx", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function response({ ok = true, body = {} } = {}) {
  return { ok, json: async () => body };
}

async function loadPage({
  reservationId = "reservation-1",
  reservationResponse,
  reservationRefreshError,
  patchResponse,
  sessionResponse,
  staffResponse,
  rejectUrl,
} = {}) {
  const states = [];
  const effects = [];
  const requests = [];
  let reservationReadCount = 0;
  let cursor = 0;
  let refCursor = 0;
  const refs = [];

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: (fn) => { effects.push(fn); },
  };

  const fetch = async (url, options = {}) => {
    requests.push({ url, options });

    if (url === rejectUrl) throw new Error(`Failed request: ${url}`);

    if (
      url === `/api/customer-reservations/${reservationId}` &&
      options.method === "PATCH"
    ) {
      return patchResponse ?? response({
        body: { ok: true, message: "予約希望を変更しました" },
      });
    }

    if (url === `/api/customer-reservations/${reservationId}`) {
      reservationReadCount += 1;

      if (reservationReadCount > 1 && reservationRefreshError) {
        throw reservationRefreshError;
      }

      return reservationResponse ?? response({
        body: {
          ok: true,
          reservation: {
            id: reservationId,
            customerId: "customer-1",
            menu: "ワンカラー",
            memo: "",
            status: "confirmed",
            staffId: "staff-1",
            staffName: "テスト担当",
            salonId: "salon-1",
            source: "customer",
            startAt: "2099-10-02T01:30:00.000Z",
            endAt: "2099-10-02T03:00:00.000Z",
            externalReservation: false,
            canDirectEdit: true,
            canDirectCancel: true,
            canRequestChange: false,
            canRequestCancel: false,
          },
        },
      });
    }

    if (url === "/api/line-login/me") {
      return sessionResponse ?? response({ body: { authenticated: true } });
    }
    if (url === "/api/customer-reservations/staffs") {
      return staffResponse ?? response({
        body: { ok: true, staffs: [{ id: "staff-1", name: "テスト担当" }] },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") return { useParams: () => ({ id: reservationId }) };
      if (name === "@/lib/reservation-status") return reservationStatusExports;
      throw new Error(`Unexpected import: ${name}`);
    },
    console,
    fetch,
  }, { filename: "customer-reservation-detail-page.js" });

  const renderElement = () => {
    cursor = 0;
    refCursor = 0;
    return exports.default();
  };
  const render = () => renderToStaticMarkup(renderElement());

  assert.match(render(), /読み込み中/);
  for (const effect of effects.splice(0)) effect();
  await setImmediate();

  return { html: render(), render, renderElement, requests };
}

function getElementText(node) {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!node?.props) return "";

  const children = Array.isArray(node.props.children)
    ? node.props.children
    : [node.props.children];
  return children.map(getElementText).join("");
}

function findElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;

  const children = Array.isArray(node.props?.children)
    ? node.props.children
    : [node.props?.children];
  for (const child of children) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

test("loads the reservation identified by the current route and renders it", async () => {
  const { html, requests } = await loadPage({ reservationId: "reservation-route-id" });

  assert.match(html, /ワンカラー/);
  assert.match(html, /テスト担当/);
  assert.doesNotMatch(html, /予約情報の取得に失敗しました/);
  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method ?? "GET", options.cache ?? null]),
    [
      ["/api/customer-reservations/reservation-route-id", "GET", "no-store"],
      ["/api/line-login/me", "GET", "no-store"],
      ["/api/customer-reservations/staffs", "GET", "no-store"],
    ]
  );
});

test("shows the API error and does not fetch staff choices after a failed reservation", async () => {
  const { html, requests } = await loadPage({
    reservationResponse: response({
      ok: false,
      body: { ok: false, error: "予約を確認できません" },
    }),
  });

  assert.match(html, /予約を確認できません/);
  assert.match(html, /再試行/);
  assert.deepEqual(
    requests.map(({ url }) => url),
    ["/api/customer-reservations/reservation-1", "/api/line-login/me"]
  );
});

test("hides reservation details and write controls when the session cannot be confirmed", async () => {
  const { html, requests } = await loadPage({
    sessionResponse: response({ ok: false }),
  });

  assert.match(html, /ログイン状態の確認に失敗しました/);
  assert.match(html, /再試行/);
  assert.doesNotMatch(html, /ワンカラー/);
  assert.doesNotMatch(html, /この内容に変更する/);
  assert.deepEqual(
    requests.map(({ url }) => url),
    ["/api/customer-reservations/reservation-1", "/api/line-login/me"]
  );
});

test("shows the signed-out state without loading staff choices", async () => {
  const { html, requests } = await loadPage({
    sessionResponse: response({ body: { authenticated: false } }),
    reservationResponse: response({
      ok: false,
      body: { ok: false, error: "LINEログインが必要です" },
    }),
  });

  assert.match(html, /LINEログインが必要です/);
  assert.match(html, /LINEでログインして予約を確認/);
  assert.match(
    html,
    /\/customer-app\/login\?next=%2Fcustomer-app%2Freservations%2Freservation-1/
  );
  assert.doesNotMatch(html, /ワンカラー/);
  assert.deepEqual(
    requests.map(({ url }) => url),
    ["/api/customer-reservations/reservation-1", "/api/line-login/me"]
  );
});

test("hides reservation details and write controls when staff choices fail", async () => {
  const { html, requests } = await loadPage({
    staffResponse: response({
      ok: false,
      body: { ok: false, error: "担当者を確認できません" },
    }),
  });

  assert.match(html, /担当者を確認できません/);
  assert.match(html, /再試行/);
  assert.doesNotMatch(html, /ワンカラー/);
  assert.doesNotMatch(html, /この内容に変更する/);
  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      "/api/customer-reservations/reservation-1",
      "/api/line-login/me",
      "/api/customer-reservations/staffs",
    ]
  );
});

test("keeps a successful empty staff list distinct from a failed staff read", async () => {
  const { html } = await loadPage({
    staffResponse: response({ body: { ok: true, staffs: [] } }),
  });

  assert.match(html, /ワンカラー/);
  assert.match(html, /この内容に変更する/);
  assert.match(html, /指名なし/);
  assert.doesNotMatch(html, /担当スタッフ情報の取得に失敗しました/);
});

test("hides reservation details after a rejected authoritative request", async () => {
  const { html } = await loadPage({
    rejectUrl: "/api/customer-reservations/staffs",
  });

  assert.match(html, /予約情報の読み込みに失敗しました/);
  assert.match(html, /再試行/);
  assert.doesNotMatch(html, /ワンカラー/);
  assert.doesNotMatch(html, /この内容に変更する/);
});

test("keeps the saved result and blocks stale actions when post-save refresh fails", async () => {
  const page = await loadPage({
    reservationRefreshError: new Error("refresh failed"),
  });
  const updateButton = findElement(
    page.renderElement(),
    (node) => node.type === "button" && /この内容に変更する/.test(getElementText(node))
  );

  assert.ok(updateButton);
  await updateButton.props.onClick();
  await setImmediate();

  const html = page.render();
  assert.match(html, /予約希望を変更しました/);
  assert.match(html, /最新の予約情報を再取得できませんでした/);
  assert.match(html, /最新情報を再読み込み/);
  assert.match(html, /ワンカラー/);
  assert.match(html, /disabled=""[^>]*>この内容に変更する/);
  assert.deepEqual(
    page.requests.map(({ url, options }) => [url, options.method ?? "GET"]),
    [
      ["/api/customer-reservations/reservation-1", "GET"],
      ["/api/line-login/me", "GET"],
      ["/api/customer-reservations/staffs", "GET"],
      ["/api/customer-reservations/reservation-1", "PATCH"],
      ["/api/customer-reservations/reservation-1", "GET"],
      ["/api/line-login/me", "GET"],
    ]
  );
});

test("submits a reservation action only once during a fast double click", async () => {
  let resolvePatch;
  const patchResponse = new Promise((resolve) => {
    resolvePatch = resolve;
  });
  const page = await loadPage({ patchResponse });
  const updateButton = findElement(
    page.renderElement(),
    (node) => node.type === "button" && /この内容に変更する/.test(getElementText(node))
  );

  assert.ok(updateButton);
  const firstClick = updateButton.props.onClick();
  const secondClick = updateButton.props.onClick();

  assert.equal(
    page.requests.filter(({ options }) => options.method === "PATCH").length,
    1
  );

  resolvePatch(response({
    body: { ok: true, message: "予約希望を変更しました" },
  }));
  await Promise.all([firstClick, secondClick]);
  await setImmediate();

  assert.equal(
    page.requests.filter(({ options }) => options.method === "PATCH").length,
    1
  );
  assert.match(page.render(), /予約希望を変更しました/);
});
