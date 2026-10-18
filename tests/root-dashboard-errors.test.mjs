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
  readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
    useCallback: fn => fn,
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
    if (table === "customers") {
      return { data: [{ id: "customer-1" }], error: null };
    }
    if (table === "visits") {
      return {
        data: [
          {
            id: "visit-1",
            customer_id: "customer-1",
            visit_date: "2026-09-29",
            price: 6000,
          },
        ],
        error: null,
      };
    }
    return {
      data: [
        {
          id: "reservation-1",
          customer_id: "customer-1",
          status: "confirmed",
          reservation_date: "2026-09-29",
        },
      ],
      error: null,
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
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "next/link") return { default: "a" };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              queries.push(table);
              return {
                select() {
                  return Promise.resolve().then(() => response(table));
                },
              };
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

  return {
    queries,
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
  };
}

for (const failureTable of ["customers", "visits", "reservations"]) {
  test(`root dashboard hides incomplete KPI after ${failureTable} query error`, async () => {
    const page = await mount({ failureTable });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(
      page.html(),
      /今日の売上|今月の売上|累計売上|¥0|顧客数: 0人|来店登録/
    );
    assert.deepEqual(page.queries.sort(), ["customers", "reservations", "visits"]);
  });
}

test("root dashboard handles a rejected request and retries", async () => {
  const page = await mount({ failureTable: "visits", rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /今日の売上|今月の売上|累計売上|来店登録/);

  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /今日の売上/);
  assert.match(page.html(), /¥6,000/);
  assert.match(page.html(), /来店登録/);
});

test("root dashboard preserves an authoritative empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /今日の売上/);
  assert.match(page.html(), /¥0/);
  assert.match(page.html(), /顧客数: 0人/);
});

test("root dashboard renders complete successful data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /今日の売上/);
  assert.match(page.html(), /¥6,000/);
  assert.match(page.html(), /顧客数: 1人/);
  assert.match(page.html(), /今日の予約数/);
});
