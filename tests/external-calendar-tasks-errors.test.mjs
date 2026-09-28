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
    new URL("../app/external-calendar-tasks/page.tsx", import.meta.url),
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
    super(...(args.length ? args : ["2026-09-28T00:00:00Z"]));
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
  const queries = [];
  let cursor = 0;
  let effect;
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
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useEffect: fn => { effect = fn; },
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
          start_at: "2026-09-30T01:00:00Z",
          end_at: "2026-09-30T02:00:00Z",
          status: "confirmed",
          memo: null,
        }],
        error: null,
      };
    }
    if (table === "customers") {
      return { data: [{ id: "customer-1", name: "顧客A" }], error: null };
    }
    return { data: [{ id: "staff-1", name: "黒木" }], error: null };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date: FixedDate,
    Intl,
    Map,
    Set,
    Promise,
    console: { error() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    window: {
      localStorage: {
        getItem() { return null; },
        setItem() {},
      },
      setTimeout() {},
    },
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

  assert.match(html(), /読み込み中/);
  tree();
  effect();
  await setImmediate();

  return {
    queries,
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

for (const failureTable of ["reservations", "customers", "staffs"]) {
  test(`external calendar tasks hides incomplete work after ${failureTable} query error`, async () => {
    const page = await mount({ failureTable });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(
      page.html(),
      /0件|外部カレンダーへ反映が必要な予約はありません|反映待ちのみ|顧客A|黒木/
    );
    assert.deepEqual(page.queries.sort(), ["customers", "reservations", "staffs"]);
  });
}

test("external calendar tasks handles a rejected query", async () => {
  const page = await mount({ failureTable: "customers", rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /0件|外部カレンダーへ反映が必要な予約はありません/);
});

test("external calendar tasks recovers after retry", async () => {
  const page = await mount({ failureTable: "reservations" });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /反映待ち[\s\S]*1件/);
  assert.match(page.html(), /顧客A|黒木|ワンカラー/);
});

test("external calendar tasks preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /0件|外部カレンダーへ反映が必要な予約はありません/);
});
