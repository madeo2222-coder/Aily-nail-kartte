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
    new URL("../app/reservations/calendar/page.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;

class FixedDate extends Date {
  constructor(...args) {
    // Noon UTC keeps the calendar date stable across runner time zones.
    super(...(args.length ? args : ["2026-09-28T12:00:00Z"]));
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

async function mount({ failureTable = "", rejection = false, empty = false } = {}) {
  const states = [];
  const effects = [];
  const queries = [];
  let cursor = 0;
  let collectEffects = true;
  let shouldFail = Boolean(failureTable);

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

  function response(table) {
    if (shouldFail && table === failureTable) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }

    if (empty) return { data: [], error: null };
    if (table === "reservations") {
      return {
        data: [{
          id: "reservation-1",
          customer_id: "customer-1",
          staff_id: "staff-1",
          menu: "ワンカラー",
          status: "confirmed",
          memo: null,
          source: "Naily",
          start_at: "2026-09-28T01:00:00Z",
          end_at: "2026-09-28T02:00:00Z",
          created_at: "2026-09-27T00:00:00Z",
        }],
        error: null,
      };
    }
    if (table === "external_calendar_blocks") {
      return { data: [], error: null };
    }
    if (table === "customers") {
      return { data: [{ id: "customer-1", name: "顧客A" }], error: null };
    }
    if (table === "staffs") {
      return { data: [{ id: "staff-1", name: "黒木" }], error: null };
    }
    if (table === "visits") {
      return {
        data: [{
          customer_id: "customer-1",
          visit_date: "2026-09-01",
          menu_name: "前回メニュー",
          menu: null,
          memo: "前回メモ",
          next_proposal: "次回提案",
        }],
        error: null,
      };
    }
    return {
      data: [{
        customer_id: "customer-1",
        allergy: "アレルギーあり",
        skin_trouble: null,
        constitution: null,
        avoid_items: null,
        submitted_at: "2026-09-01T00:00:00Z",
        created_at: "2026-09-01T00:00:00Z",
      }],
      error: null,
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date: FixedDate,
    Error,
    Intl,
    Map,
    Math,
    Number,
    Promise,
    Set,
    console: { error() {} },
    alert() {},
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, count: 0 }) }),
    window: { confirm: () => true },
    require(name) {
      if (name === "react") return hooks;
      if (name === "next/link") return { default: "a" };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              queries.push(table);
              const chain = {
                select() { return chain; },
                order() { return chain; },
                eq() { return chain; },
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

  function tree() {
    cursor = 0;
    return exports.default();
  }

  function html() {
    return renderToStaticMarkup(tree());
  }

  const initialHtml = html();
  assert.match(initialHtml, /読み込み中/);
  assert.doesNotMatch(initialHtml, /重複は見つかっていません|予約今すぐ同期/);
  collectEffects = false;
  effects[0]();
  await setImmediate();

  return {
    html,
    queries,
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行",
      );
      assert.ok(button, "retry button exists");
      shouldFail = false;
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
  };
}

for (const failureTable of [
  "reservations",
  "external_calendar_blocks",
  "customers",
  "staffs",
  "visits",
  "customer_intakes",
]) {
  test(`reservation calendar hides incomplete data after ${failureTable} query error`, async () => {
    const page = await mount({ failureTable });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(
      page.html(),
      /0件|重複は見つかっていません|予約今すぐ同期|顧客A|黒木/,
    );
    assert.deepEqual(page.queries.sort(), [
      "customer_intakes",
      "customers",
      "external_calendar_blocks",
      "reservations",
      "staffs",
      "visits",
    ]);
  });
}

test("reservation calendar handles a rejected query", async () => {
  const page = await mount({ failureTable: "external_calendar_blocks", rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /0件|重複は見つかっていません/);
});

test("reservation calendar recovers after retry", async () => {
  const page = await mount({ failureTable: "visits" });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /黒木/);
  assert.match(page.html(), /ワンカラー/);
  assert.match(page.html(), /再来・1回来店/);
  assert.match(page.html(), /アレルギーあり/);
});

test("reservation calendar preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /予約件数：\s*0件/);
  assert.match(page.html(), /重複は見つかっていません/);
});

test("reservation calendar renders complete successful data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /黒木/);
  assert.match(page.html(), /ワンカラー/);
});
