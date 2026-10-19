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
  readFileSync(new URL("../app/visits/upcoming/page.tsx", import.meta.url), "utf8"),
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
  const requests = [];
  let cursor = 0;
  let effect;
  let shouldFail = Boolean(failureTable);

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
    useEffect: fn => { effect = fn; },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date: FixedDate,
    Map,
    Set,
    Promise,
    console: { error() {} },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (shouldFail && rejection) throw new Error("offline");
      if (shouldFail) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: "read failed" }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          items: empty ? [] : [{
            id: "visit-1",
            customer_id: "customer-1",
            customer_name: "顧客A",
            phone: "090-0000-0000",
            last_visit_date: "2026-09-20",
            next_visit_date: "2026-09-30",
            next_suggestion: "秋ネイル",
          }],
        }),
      };
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "next/link") return { default: "a" };
      if (name === "react/jsx-runtime") return require(name);
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function tree() { cursor = 0; return exports.default(); }
  function html() { return renderToStaticMarkup(tree()); }
  tree();
  effect();
  await setImmediate();

  return {
    requests,
    html,
    async retry() {
      const button = findNode(tree(), node => node.type === "button" && node.props.children === "再試行");
      assert.ok(button);
      shouldFail = false;
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
  };
}

for (const failureTable of ["visits", "customers"]) {
  for (const rejection of [false, true]) {
    test(`upcoming visits hides partial data after ${failureTable} ${rejection ? "rejection" : "query error"} and retries`, async () => {
      const page = await mount({ failureTable, rejection });
      assert.match(page.html(), /role="alert"/);
      assert.doesNotMatch(page.html(), /対象の次回来店予定はありません|顧客名：不明|顧客A|秋ネイル/);
      await page.retry();
      assert.doesNotMatch(page.html(), /role="alert"|対象の次回来店予定はありません|顧客名：不明/);
      assert.match(page.html(), /顧客A/);
      assert.match(page.html(), /秋ネイル/);
    });
  }
}

test("upcoming visits preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /対象の次回来店予定はありません/);
  assert.equal(page.requests.length, 1);
});

test("upcoming visits renders complete customer data after successful reads", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"|顧客名：不明/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /090-0000-0000/);
  assert.deepEqual(JSON.parse(JSON.stringify(page.requests)), [{
    url: "/api/visits/upcoming-data",
    options: { cache: "no-store" },
  }]);
});
