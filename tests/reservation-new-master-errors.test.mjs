import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const externalReservationMetadata = (() => {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(
      new URL("../lib/external-reservation-metadata.ts", import.meta.url),
      "utf8"
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText;
  vm.runInNewContext(source, { exports });
  return exports;
})();
const staffReservationSubmission = (() => {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(
      new URL("../lib/staff-reservation-submission.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(source, { exports, JSON, RegExp });
  return exports;
})();
const pageSource = readFileSync(
  new URL("../app/reservations/new/page.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(
  pageSource,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
).outputText;

test("staff reservation creation uses its authenticated API instead of browser database access", () => {
  assert.doesNotMatch(pageSource, /@\/lib\/supabase|supabase\.from/);
  assert.match(pageSource, /fetch\("\/api\/reservations\/staff-create"/);
  assert.match(
    pageSource,
    /if \(submissionInFlight\.current \|\| submissionResultUnknown\) return/,
  );
  assert.ok(
    pageSource.indexOf("submissionInFlight.current = true") <
      pageSource.indexOf('method: "POST"'),
  );
});

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
  failure = false,
  rejection = false,
  empty = false,
  postMode = "success",
} = {}) {
  const states = [];
  let cursor = 0;
  let effects = [];
  const cleanups = [];
  let shouldFail = failure;
  const requests = [];
  const pushed = [];
  const storageValues = new Map();
  const localStorage = {
    getItem(key) {
      return storageValues.has(key) ? storageValues.get(key) : null;
    },
    setItem(key, value) {
      storageValues.set(key, String(value));
    },
    removeItem(key) {
      storageValues.delete(key);
    },
  };

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
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
    useCallback: fn => fn,
    useEffect: fn => { effects.push(fn); },
  };

  async function fetch(url, options) {
    requests.push({ url, options });
    if (options?.method === "POST") {
      if (postMode === "rejection") throw new Error("connection lost");
      if (postMode === "unknown-json") {
        return {
          ok: true,
          async json() {
            throw new Error("response lost");
          },
        };
      }
      if (postMode === "failure") {
        return {
          ok: false,
          async json() {
            return { ok: false, error: "予約枠が重複しています。" };
          },
        };
      }
      return {
        ok: true,
        async json() {
          return { ok: true, reservation: { id: "r1" } };
        },
      };
    }
    if (shouldFail && rejection) throw new Error("offline");
    if (shouldFail) {
      return {
        ok: false,
        async json() {
          return { ok: false, error: "予約登録に必要なデータを取得できませんでした。" };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return empty
          ? { ok: true, salons: [], customers: [], staffs: [] }
          : {
              ok: true,
              salons: [{ id: "s1", name: "Aily" }],
              customers: [{ id: "c1", name: "顧客A", salon_id: "s1" }],
              staffs: [{ id: "st1", name: "スタッフA", salon_id: "s1" }],
            };
      },
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    fetch,
    Intl,
    Number,
    Promise,
    crypto: {
      randomUUID() {
        return "33333333-3333-4333-8333-333333333333";
      },
    },
    window: { localStorage },
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") {
        return { useRouter: () => ({ push(path) { pushed.push(path); } }) };
      }
      if (name === "@/lib/external-reservation-metadata") {
        return externalReservationMetadata;
      }
      if (name === "@/lib/staff-reservation-submission") {
        return staffReservationSubmission;
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function tree() {
    cursor = 0;
    effects = [];
    return exports.default();
  }
  function html() { return renderToStaticMarkup(tree()); }

  tree();
  for (const effect of effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  await setImmediate();

  return {
    requests,
    pushed,
    localStorage,
    html,
    unmount() { for (const cleanup of cleanups) cleanup(); },
    async retry() {
      const button = findNode(tree(), node => node.type === "button" && node.props.children === "再試行");
      assert.ok(button);
      shouldFail = false;
      button.props.onClick();
      await setImmediate();
    },
    async submit() {
      const current = tree();
      const customer = findNode(
        current,
        node =>
          node.type === "select" &&
          Boolean(findNode(node, child => child.type === "option" && child.props.value === "c1")),
      );
      const staff = findNode(
        current,
        node =>
          node.type === "select" &&
          Boolean(findNode(node, child => child.type === "option" && child.props.value === "st1")),
      );
      const date = findNode(current, node => node.type === "input" && node.props.type === "date");
      assert.ok(customer);
      assert.ok(staff);
      assert.ok(date);
      customer.props.onChange({ target: { value: "c1" } });
      staff.props.onChange({ target: { value: "st1" } });
      date.props.onChange({ target: { value: "2026-11-01" } });

      const button = findNode(
        tree(),
        node => node.type === "button" && String(node.props.className || "").includes("w-full"),
      );
      assert.ok(button);
      await button.props.onClick();
      await setImmediate();
    },
  };
}

test("reservation creation hides the form when authenticated master data fails", async () => {
  const page = await mount({ failure: true });
  assert.match(page.html(), /role="alert"/);
  assert.match(page.html(), /予約登録に必要なデータを取得できませんでした/);
  assert.doesNotMatch(page.html(), /登録種別|登録内容確認|>登録する</);
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, "/api/reservations/staff-create");
  assert.deepEqual(JSON.parse(JSON.stringify(page.requests[0].options)), {
    method: "GET",
    cache: "no-store",
  });
  page.unmount();
});

test("reservation creation handles a rejected master query and retries all sources", async () => {
  const page = await mount({ failure: true, rejection: true });
  assert.match(page.html(), /予約登録に必要なデータを取得できませんでした/);
  assert.doesNotMatch(page.html(), /登録内容確認/);
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /登録種別/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /スタッフA/);
  assert.equal(page.requests.length, 2);
  page.unmount();
});

test("reservation creation preserves authoritative empty master results", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /登録種別/);
  assert.match(page.html(), /選択してください/);
  assert.equal(page.requests.length, 1);
  page.unmount();
});

test("reservation creation renders complete master data only after every query succeeds", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /Aily/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /スタッフA/);
  assert.match(page.html(), /登録内容確認/);
  assert.equal(page.requests.length, 1);
  page.unmount();
});

test("reservation creation locks resubmission when a successful response body is lost", async () => {
  const page = await mount({ postMode: "unknown-json" });
  await page.submit();
  assert.match(page.html(), /予約登録の結果を確認できませんでした/);
  assert.match(page.html(), /最新の予約を確認/);
  assert.match(page.html(), /カレンダーで結果を確認してください/);
  assert.equal(page.requests.filter(request => request.options?.method === "POST").length, 1);
  const postBody = JSON.parse(
    page.requests.find(request => request.options?.method === "POST").options.body,
  );
  assert.equal(postBody.operationId, "33333333-3333-4333-8333-333333333333");
  assert.match(
    page.localStorage.getItem("aily:staff-reservation-submission:v1"),
    /33333333-3333-4333-8333-333333333333/,
  );

  await page.submit();
  assert.equal(page.requests.filter(request => request.options?.method === "POST").length, 1);
  page.unmount();
});

test("reservation creation opens the calendar after an authoritative success", async () => {
  const page = await mount();
  await page.submit();
  assert.deepEqual(page.pushed, ["/reservations/calendar"]);
  assert.doesNotMatch(page.html(), /予約登録の結果を確認できませんでした/);
  assert.equal(
    page.localStorage.getItem("aily:staff-reservation-submission:v1"),
    null,
  );
  page.unmount();
});

test("reservation creation locks resubmission after a network result loss", async () => {
  const page = await mount({ postMode: "rejection" });
  await page.submit();
  assert.match(page.html(), /同じ内容を再送せず/);
  assert.equal(page.requests.filter(request => request.options?.method === "POST").length, 1);

  await page.submit();
  assert.equal(page.requests.filter(request => request.options?.method === "POST").length, 1);
  page.unmount();
});

test("reservation creation allows retry after an authoritative API rejection", async () => {
  const page = await mount({ postMode: "failure" });
  await page.submit();
  assert.match(page.html(), /予約枠が重複しています/);
  assert.doesNotMatch(page.html(), /最新の予約を確認/);
  assert.equal(
    page.localStorage.getItem("aily:staff-reservation-submission:v1"),
    null,
  );

  await page.submit();
  assert.equal(page.requests.filter(request => request.options?.method === "POST").length, 2);
  page.unmount();
});
