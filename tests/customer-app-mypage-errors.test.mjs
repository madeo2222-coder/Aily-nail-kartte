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
  readFileSync(
    new URL("../app/customer-app/mypage/page.tsx", import.meta.url),
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

async function mount({ failure = "", rejection = false, meOk = true } = {}) {
  const states = [];
  const tableCalls = new Map();
  let cursor = 0;
  let effect;
  let shouldFail = Boolean(failure) || !meOk;

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
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useEffect: fn => { effect = fn; },
  };

  function queryResponse(table, callNumber) {
    if (shouldFail && failure === `${table}:${callNumber}`) {
      if (rejection) throw new Error("offline");
      return { data: null, count: null, error: { message: "read failed" } };
    }

    return {
      data: [],
      count: table === "visits" && callNumber === 2 ? 0 : null,
      error: null,
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Intl,
    Map,
    Number,
    Promise,
    window: { location: { href: "" } },
    console: { error() {} },
    fetch: async url => {
      assert.equal(url, "/api/line-login/me");
      if (shouldFail && !meOk) return { ok: false, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          authenticated: true,
          customer: { id: "customer-1", name: "顧客A", salon_id: null },
        }),
      };
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              const callNumber = (tableCalls.get(table) || 0) + 1;
              tableCalls.set(table, callNumber);
              const chain = {
                select() { return chain; },
                eq() { return chain; },
                order() { return chain; },
                limit() { return chain; },
                maybeSingle() { return chain; },
                then(resolve, reject) {
                  return Promise.resolve()
                    .then(() => queryResponse(table, callNumber))
                    .then(resolve, reject);
                },
              };
              return chain;
            },
          },
        };
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

  tree();
  effect();
  await setImmediate();

  return {
    html,
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button);
      shouldFail = false;
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
  };
}

for (const failure of [
  "visits:1",
  "visits:2",
  "sanmeigaku_diagnoses:1",
  "reservations:1",
  "staffs:1",
  "nail_tip_orders:1",
]) {
  test(`customer mypage blocks false empty state after ${failure} query error`, async () => {
    const page = await mount({ failure });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(page.html(), /現在の来店回数|注文履歴はありません|未来の予約はありません/);
  });
}

test("customer mypage also handles rejected reads and retries", async () => {
  const page = await mount({ failure: "reservations:1", rejection: true });
  assert.match(page.html(), /role="alert"/);
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /0回/);
  assert.match(page.html(), /注文履歴はありません/);
  assert.match(page.html(), /現在、未来の予約はありません/);
});

test("customer mypage preserves legitimate empty states", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A様のマイページ/);
  assert.match(page.html(), /まだ診断結果がありません/);
  assert.match(page.html(), /0回/);
});

test("customer mypage shows the load error before the logged-out prompt", async () => {
  const page = await mount({ meOk: false });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /LINEでログイン/);
});
