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

async function loadPage({ reservationId = "reservation-1", reservationResponse } = {}) {
  const states = [];
  const effects = [];
  const requests = [];
  let cursor = 0;

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: (fn) => { effects.push(fn); },
  };

  const fetch = async (url, options = {}) => {
    requests.push({ url, options });

    if (url === `/api/customer-reservations/${reservationId}`) {
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

    if (url === "/api/line-login/me") return response();
    if (url === "/api/customer-reservations/staffs") {
      return response({ body: { ok: true, staffs: [{ id: "staff-1", name: "テスト担当" }] } });
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
      throw new Error(`Unexpected import: ${name}`);
    },
    console,
    fetch,
  }, { filename: "customer-reservation-detail-page.js" });

  const render = () => {
    cursor = 0;
    return renderToStaticMarkup(exports.default());
  };

  assert.match(render(), /読み込み中/);
  for (const effect of effects.splice(0)) effect();
  await setImmediate();

  return { html: render(), requests };
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
  assert.deepEqual(
    requests.map(({ url }) => url),
    ["/api/customer-reservations/reservation-1", "/api/line-login/me"]
  );
});
