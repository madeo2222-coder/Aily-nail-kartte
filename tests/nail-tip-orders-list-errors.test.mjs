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
    new URL("../app/nail-tip-orders/NailTipOrdersPageClient.tsx", import.meta.url),
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

async function mount({ failureSource = "", rejection = false, empty = false } = {}) {
  const states = [];
  const effects = [];
  const fetchCalls = [];
  const customerQueries = [];
  let cursor = 0;
  let collectEffects = true;
  let currentFailureSource = failureSource;

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
    useEffect: fn => {
      if (collectEffects) effects.push(fn);
    },
  };

  function apiResponse(source) {
    if (currentFailureSource === source && rejection) {
      return Promise.reject(new Error("offline"));
    }

    const failed = currentFailureSource === source;
    const payload = failed
      ? { ok: false, error: "read failed" }
      : source === "domestic"
        ? {
            ok: true,
            orders: empty
              ? []
              : [{
                  id: "domestic-1",
                  salon_id: null,
                  customer_id: "customer-1",
                  lucky_color: "ピンク",
                  lucky_stone: "ローズクォーツ",
                  nail_theme: "愛情運",
                  design_request: "華やか",
                  size_status: "確認済み",
                  delivery_request: "急ぎ",
                  status: "paid",
                  created_at: "2026-09-29T00:00:00Z",
                }],
          }
        : {
            ok: true,
            requests: empty
              ? []
              : [{
                  id: "inbound-1",
                  customer_name: "海外顧客B",
                  country: "US",
                  status: "making",
                  order_type: "anime_character",
                  design_request: "Blue design",
                  created_at: "2026-09-29T00:00:00Z",
                }],
          };

    return Promise.resolve({
      ok: !failed,
      json: async () => payload,
    });
  }

  function customerResponse() {
    if (currentFailureSource === "customers") {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }
    return {
      data: empty ? [] : [{ id: "customer-1", name: "国内顧客A" }],
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
    console: { error() {} },
    fetch(url) {
      fetchCalls.push(url);
      return apiResponse(url.includes("inbound") ? "inbound" : "domestic");
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { __esModule: true, default: "a" };
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              assert.equal(table, "customers");
              customerQueries.push(table);
              const chain = {
                select() { return chain; },
                then(resolve, reject) {
                  return Promise.resolve()
                    .then(customerResponse)
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

  assert.match(html(), /読み込み中/);
  collectEffects = false;
  effects[0]();
  await setImmediate();
  await setImmediate();

  return {
    fetchCalls,
    customerQueries,
    html,
    tree,
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button, "retry button exists");
      currentFailureSource = "";
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
      await setImmediate();
    },
  };
}

for (const failureSource of ["domestic", "inbound", "customers"]) {
  test(`nail-tip order list hides incomplete work when ${failureSource} fails`, async () => {
    const page = await mount({ failureSource });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /ネイルチップ注文を取得できませんでした/);
    assert.doesNotMatch(
      page.html(),
      /総注文数|支払待ち|ネイルチップ注文はまだありません|制作中へ|発送済みへ|完了へ/
    );
  });
}

test("nail-tip order list handles a rejected request", async () => {
  const page = await mount({ failureSource: "inbound", rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /総注文数|ネイルチップ注文はまだありません/);
});

test("nail-tip order list recovers all sources after retry", async () => {
  const page = await mount({ failureSource: "domestic" });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"|ネイルチップ注文はまだありません/);
  assert.match(page.html(), /国内顧客A/);
  assert.match(page.html(), /海外顧客B/);
  assert.match(page.html(), /制作中へ/);
  assert.equal(page.fetchCalls.length, 4);
  assert.equal(page.customerQueries.length, 2);
});

test("nail-tip order list preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /総注文数/);
  assert.match(page.html(), /ネイルチップ注文はまだありません/);
});

test("nail-tip order list renders complete successful data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|ネイルチップ注文はまだありません/);
  assert.match(page.html(), /国内顧客A/);
  assert.match(page.html(), /海外顧客B/);
  assert.match(page.html(), /2件/);
  assert.match(page.html(), /制作中へ/);
  assert.deepEqual(page.fetchCalls, [
    "/api/nail-tip-orders/admin",
    "/api/inbound-nail-tip-requests/admin",
  ]);
  assert.deepEqual(page.customerQueries, ["customers"]);
});
