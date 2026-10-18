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
  readFileSync(new URL("../app/customers/[id]/page.tsx", import.meta.url), "utf8"),
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

function depsChanged(previous, deps) {
  return !previous || deps.some((value, index) => !Object.is(value, previous.deps[index]));
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

async function mount({ failureTable = "", rejection = false, empty = false, missing = false } = {}) {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let tree;
  let shouldFail = Boolean(failureTable);
  const queries = [];

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: fn => fn(),
    useCallback(fn, deps) {
      const index = cursor++;
      if (depsChanged(slots[index], deps)) slots[index] = { deps, value: fn };
      return slots[index].value;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (depsChanged(previous, deps)) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };

  function successfulResponse(table) {
    if (table === "customers") {
      if (missing) return { data: null, error: { code: "PGRST116", message: "0 rows" } };
      return {
        data: { id: "customer-1", name: "顧客A", name_kana: "コキャクエー", phone: "09000000000" },
        error: null,
      };
    }
    if (empty) return { data: [], error: null };
    if (table === "visits") {
      return {
        data: [{
          id: "visit-1",
          customer_id: "customer-1",
          visit_date: "2026-09-28",
          menu_name: "ワンカラー",
          menu: null,
          color: "ベージュ",
          price: 6500,
          payment_method: "現金",
          memo: "次回も同色",
          next_visit_date: "2026-10-20",
          next_proposal: "秋色",
        }],
        error: null,
      };
    }
    if (table === "visit_payments") {
      return {
        data: [{ id: "payment-1", visit_id: "visit-1", payment_method: "現金", amount: 6500, sort_order: 1 }],
        error: null,
      };
    }
    if (table === "visit_photos") return { data: [], error: null };
    if (table === "reservations") {
      return {
        data: [{
          id: "reservation-1",
          customer_id: "customer-1",
          staff_id: "staff-1",
          status: "confirmed",
          start_at: "2026-10-01T01:00:00Z",
          menu: "グラデーション",
        }],
        error: null,
      };
    }
    if (table === "staffs") {
      return { data: [{ id: "staff-1", name: "黒木" }], error: null };
    }
    return {
      data: [{
        id: "intake-1",
        customer_id: "customer-1",
        name: "顧客A",
        phone: "09000000000",
        allergy: "なし",
        submitted_at: "2026-09-01T00:00:00Z",
        created_at: "2026-09-01T00:00:00Z",
      }],
      error: null,
    };
  }

  function response(table) {
    if (shouldFail && table === failureTable) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { code: "500", message: "read failed" } };
    }
    return successfulResponse(table);
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date: FixedDate,
    Intl,
    Map,
    Math,
    Number,
    Promise,
    Set,
    console: { error() {} },
    window: { confirm: () => true },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/image") return { default: "img" };
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") {
        return {
          useParams: () => ({ id: "customer-1" }),
          useRouter: () => ({ push() {} }),
        };
      }
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              queries.push(table);
              const chain = {
                select() { return chain; },
                eq() { return chain; },
                in() { return chain; },
                order() { return chain; },
                single() { return Promise.resolve().then(() => response(table)); },
                then(resolve, reject) {
                  return Promise.resolve().then(() => response(table)).then(resolve, reject);
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

  function render() {
    cursor = 0;
    tree = exports.default();
    const effects = pendingEffects;
    pendingEffects = [];
    effects.forEach(effect => effect());
  }

  async function settle() {
    for (let index = 0; index < 12; index += 1) await setImmediate();
    render();
  }

  render();
  await settle();

  return {
    queries,
    html() { return renderToStaticMarkup(tree); },
    async retry() {
      const button = findNode(tree, node => node.type === "button" && node.props?.children === "再試行");
      assert.ok(button, "retry button should be visible");
      shouldFail = false;
      button.props.onClick();
      render();
      await settle();
    },
    unmount() {
      slots.forEach(slot => slot?.cleanup?.());
    },
  };
}

for (const failureTable of [
  "customers",
  "visits",
  "visit_payments",
  "visit_photos",
  "reservations",
  "staffs",
  "customer_intakes",
]) {
  test(`customer detail hides incomplete data and writes when ${failureTable} fails`, async () => {
    const page = await mount({ failureTable });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /不完全な状態での表示と操作を防ぐ/);
    assert.doesNotMatch(
      page.html(),
      /顧客詳細ページ|来店回数|累計売上|次回予約は未登録|来店履歴はまだありません|初回カウンセリング情報はまだ登録|>編集<|>削除</
    );
    page.unmount();
  });
}

test("customer detail handles a rejected dependent read and recovers on retry", async () => {
  const page = await mount({ failureTable: "visit_photos", rejection: true });
  assert.match(page.html(), /顧客詳細を取得できませんでした/);
  assert.doesNotMatch(page.html(), /来店履歴を追加|>編集<|>削除/);
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /¥6,500/);
  assert.match(page.html(), /黒木/);
  assert.match(page.html(), /グラデーション/);
  assert.match(page.html(), /来店履歴を追加/);
  assert.equal(page.queries.filter(table => table === "customers").length, 2);
  assert.equal(page.queries.filter(table => table === "visit_photos").length, 2);
  page.unmount();
});

test("customer detail preserves authoritative empty states", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /来店回数/);
  assert.match(page.html(), /¥0/);
  assert.match(page.html(), /次回予約は未登録/);
  assert.match(page.html(), /来店履歴はまだありません/);
  assert.match(page.html(), /初回カウンセリング情報はまだ登録/);
  assert.match(page.html(), /来店履歴を追加/);
  page.unmount();
});

test("customer detail distinguishes a missing customer from a read failure", async () => {
  const page = await mount({ missing: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客情報が見つかりません/);
  assert.doesNotMatch(page.html(), /再試行|来店履歴を追加|>編集<|>削除/);
  page.unmount();
});

test("customer detail renders only complete successful data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|次回予約は未登録|来店履歴はまだありません/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /¥6,500/);
  assert.match(page.html(), /黒木/);
  assert.match(page.html(), /グラデーション/);
  assert.match(page.html(), /アレルギー情報/);
  assert.match(page.html(), /来店履歴を追加/);
  assert.deepEqual(
    [...new Set(page.queries)].sort(),
    ["customer_intakes", "customers", "reservations", "staffs", "visit_payments", "visit_photos", "visits"]
  );
  page.unmount();
});
