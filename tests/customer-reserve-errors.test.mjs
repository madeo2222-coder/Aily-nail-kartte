import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(new URL("../app/customer-app/reserve/page.tsx", import.meta.url), "utf8"),
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

async function mount({ authResponse, rejectAuth = false, availabilityMode = "success" } = {}) {
  const states = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let currentAvailabilityMode = availabilityMode;

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
    window: { setTimeout() {}, location: { origin: "https://example.test" } },
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
    dateInput.props.onChange({ target: { value: "2026-10-01" } });

    tree();
    const selectedEffects = [...effects];
    selectedEffects[2]();
    await setImmediate();
  }

  return {
    html,
    requests,
    selectMenuAndDate,
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
