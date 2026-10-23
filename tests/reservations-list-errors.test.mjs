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

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ["2026-09-29T00:00:00Z"]));
  }
}

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function mount({ failureMode = "", empty = false } = {}) {
  const states = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let collectEffects = true;
  let shouldFail = Boolean(failureMode);

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
          reservation_date: "2026-09-29",
          reservation_time: "10:00",
          status: "confirmed",
          memo: null,
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
    alert() {},
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
        return {
          ok: true,
          async json() {
            return { ok: true, reservation: { id: "reservation-1", status: "来店" } };
          },
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    },
    window: {
      confirm: () => true,
      history: { replaceState() {} },
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
    expectedStatus: "confirmed",
  });
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
});
