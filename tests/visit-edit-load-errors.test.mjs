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
  readFileSync(new URL("../app/visits/[id]/edit/page.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
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

async function mount({ failureTable = "", rejection = false, customerId = "customer-1" } = {}) {
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
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      const changed = !previous || deps.some((value, i) => !Object.is(value, previous.deps[i]));
      if (changed) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };

  function successfulResponse(table) {
    if (table === "visits") {
      return {
        data: {
          id: "visit-1",
          customer_id: customerId,
          visit_date: "2026-09-29",
          menu: "ワンカラー",
          menu_name: null,
          color: "ベージュ",
          memo: "test",
          price: 6500,
          payment_method: "現金",
          created_at: "2026-09-29T00:00:00Z",
        },
        error: null,
      };
    }
    if (table === "customers") {
      return { data: { id: "customer-1", name: "顧客A", salon_id: "salon-1" }, error: null };
    }
    if (table === "visit_photos") return { data: [], error: null };
    return {
      data: [{ id: "payment-1", visit_id: "visit-1", payment_method: "現金", amount: 6500, sort_order: 1 }],
      error: null,
    };
  }

  function response(table) {
    if (shouldFail && table === failureTable) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }
    return successfulResponse(table);
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Intl,
    Math,
    Number,
    Promise,
    console: { error() {} },
    URL: { revokeObjectURL() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") {
        return {
          useParams: () => ({ id: "visit-1" }),
          useRouter: () => ({ push() {} }),
        };
      }
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              const query = { table, filters: [] };
              queries.push(query);
              const chain = {
                select() { return chain; },
                eq(column, value) { query.filters.push([column, value]); return chain; },
                single() { return Promise.resolve().then(() => response(table)); },
                order() { return Promise.resolve().then(() => response(table)); },
              };
              return chain;
            },
          },
        };
      }
      if (name === "@/lib/visitPhotoStorage") return {
        VISIT_PHOTO_ACCEPT: "image/jpeg,image/png,image/webp",
        validateVisitPhotoMetadata: file => file,
        validateVisitPhotoFile: async file => ({ file, contentType: file.type, extension: "png" }),
        createVisitPhotoPath: () => "visit/photo-test.png",
      };
      if (name === "./VisitEditPhoto") return { default: "img" };
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
    await setImmediate();
    await setImmediate();
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

for (const failureTable of ["customers", "visit_photos", "visit_payments"]) {
  test(`visit edit hides all write controls when ${failureTable} fails`, async () => {
    const page = await mount({ failureTable });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /不完全な状態での編集を防ぐ/);
    assert.doesNotMatch(page.html(), /保存する|この来店履歴を削除|写真はありません/);
    page.unmount();
  });
}

test("visit edit handles a rejected dependent query and reloads every source on retry", async () => {
  const page = await mount({ failureTable: "visit_payments", rejection: true });
  assert.match(page.html(), /編集データを取得できませんでした/);
  assert.doesNotMatch(page.html(), /保存する/);
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /保存する/);
  assert.equal(page.queries.filter(query => query.table === "visits").length, 2);
  assert.equal(page.queries.filter(query => query.table === "visit_payments").length, 2);
  page.unmount();
});

test("visit edit blocks a missing referenced customer instead of showing an incomplete form", async () => {
  const page = await mount({ failureTable: "customers" });
  assert.match(page.html(), /顧客の取得に失敗しました/);
  assert.doesNotMatch(page.html(), /顧客名未登録|保存する/);
  page.unmount();
});

test("visit edit accepts an authoritative visit without a customer reference", async () => {
  const page = await mount({ customerId: null });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客名未登録/);
  assert.match(page.html(), /写真はありません/);
  assert.match(page.html(), /保存する/);
  assert.equal(page.queries.some(query => query.table === "customers"), false);
  page.unmount();
});
