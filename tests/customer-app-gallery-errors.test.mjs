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
    new URL("../app/customer-app/gallery/page.tsx", import.meta.url),
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

  function queryResponse(table) {
    if (shouldFail && table === failureTable) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }

    if (table === "visit_photos") {
      return {
        data: empty
          ? []
          : [{
              id: "photo-1",
              visit_id: "visit-1",
              salon_id: "salon-1",
              image_url: "https://example.com/nail.jpg",
              photo_type: "after",
              created_at: "2026-09-20T10:00:00",
            }],
        error: null,
      };
    }

    return {
      data: [{
        id: "visit-1",
        visit_date: "2026-09-20",
        menu_name: "秋ネイル",
        menu: null,
        color: "ボルドー",
        memo: null,
      }],
      error: null,
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Array,
    Date,
    Map,
    Number,
    Promise,
    Set,
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "../CustomerPhoto") {
        return { default: "img" };
      }
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              queries.push(table);
              const chain = {
                select() { return chain; },
                not() { return chain; },
                order() { return chain; },
                limit() { return chain; },
                in() { return chain; },
                then(resolve, reject) {
                  return Promise.resolve()
                    .then(() => queryResponse(table))
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

for (const failureTable of ["visit_photos", "visits"]) {
  for (const rejection of [false, true]) {
    test(`customer gallery blocks incomplete data after ${failureTable} ${rejection ? "rejection" : "query error"}`, async () => {
      const page = await mount({ failureTable, rejection });
      assert.match(page.html(), /role="alert"/);
      assert.doesNotMatch(page.html(), /デザイン一覧|まだギャラリーに表示できる写真がありません/);
    });
  }
}

test("customer gallery recovers after retry", async () => {
  const page = await mount({ failureTable: "visits" });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /1枚/);
  assert.match(page.html(), /秋ネイル/);
  assert.match(page.html(), /ボルドー/);
});

test("customer gallery preserves a successful empty state", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /0枚/);
  assert.match(page.html(), /まだギャラリーに表示できる写真がありません/);
  assert.deepEqual(page.queries, ["visit_photos"]);
});
