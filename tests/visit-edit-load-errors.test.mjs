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
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

const VISIT_ID = "40000000-0000-4000-8000-000000000004";
const CUSTOMER_ID = "10000000-0000-4000-8000-000000000001";
const SALON_ID = "30000000-0000-4000-8000-000000000003";

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function successfulBody(customerId) {
  return {
    ok: true,
    visit: {
      id: VISIT_ID,
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
    customer: customerId
      ? { id: CUSTOMER_ID, name: "顧客A", salon_id: SALON_ID }
      : null,
    photos: [],
    payments: [
      {
        id: "50000000-0000-4000-8000-000000000005",
        visit_id: VISIT_ID,
        payment_method: "現金",
        amount: 6500,
        sort_order: 1,
      },
    ],
  };
}

async function mount({ mode = "success", customerId = CUSTOMER_ID } = {}) {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let tree;
  let responseMode = mode;
  const requests = [];
  const dbCalls = [];

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
    fetch(url, options) {
      requests.push({ url, options });
      return Promise.resolve().then(() => {
        if (responseMode === "rejection") throw new Error("offline");
        if (responseMode === "not-found") {
          return { ok: false, status: 404, json: async () => ({ ok: false }) };
        }
        if (responseMode === "api-error") {
          return { ok: false, status: 500, json: async () => ({ ok: false }) };
        }
        if (responseMode === "malformed") {
          return { ok: true, status: 200, json: async () => ({ ok: true, visit: null }) };
        }
        return { ok: true, status: 200, json: async () => successfulBody(customerId) };
      });
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") {
        return {
          useParams: () => ({ id: VISIT_ID }),
          useRouter: () => ({ push() {} }),
        };
      }
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              dbCalls.push(table);
              throw new Error("edit loading must use the staff API");
            },
          },
        };
      }
      if (name === "@/lib/visitPhotoStorage") return {
        VISIT_PHOTO_ACCEPT: "image/jpeg,image/png,image/webp",
        validateVisitPhotoMetadata: file => file,
        validateVisitPhotoFile: async file => ({ file, contentType: file.type, extension: "png" }),
        createVisitPhotoPath: () => `${VISIT_ID}/photo-test.png`,
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
    requests,
    dbCalls,
    html() { return renderToStaticMarkup(tree); },
    async retry() {
      const button = findNode(tree, node => node.type === "button" && node.props?.children === "再試行");
      assert.ok(button, "retry button should be visible");
      responseMode = "success";
      button.props.onClick();
      render();
      await settle();
    },
    unmount() {
      slots.forEach(slot => slot?.cleanup?.());
    },
  };
}

for (const mode of ["api-error", "malformed", "rejection"]) {
  test(`visit edit hides all write controls when the edit API returns ${mode}`, async () => {
    const page = await mount({ mode });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(page.html(), /保存する|この来店履歴を削除|写真はありません/);
    assert.equal(page.dbCalls.length, 0);
    page.unmount();
  });
}

test("visit edit reloads the authenticated API on retry", async () => {
  const page = await mount({ mode: "rejection" });
  assert.match(page.html(), /編集データを取得できませんでした/);
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /保存する/);
  assert.equal(page.requests.length, 2);
  assert.equal(page.requests[0].url, `/api/visits/${VISIT_ID}/edit-data`);
  assert.equal(page.requests[0].options.cache, "no-store");
  page.unmount();
});

test("visit edit reports a missing visit without rendering write controls", async () => {
  const page = await mount({ mode: "not-found" });
  assert.match(page.html(), /削除済みの可能性/);
  assert.doesNotMatch(page.html(), /保存する|この来店履歴を削除/);
  page.unmount();
});

test("visit edit accepts an authoritative visit without a customer reference", async () => {
  const page = await mount({ customerId: null });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客名未登録/);
  assert.match(page.html(), /写真はありません/);
  assert.match(page.html(), /保存する/);
  assert.equal(page.dbCalls.length, 0);
  page.unmount();
});
