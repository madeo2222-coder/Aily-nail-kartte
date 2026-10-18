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
  readFileSync(new URL("../app/staff/manage/page.tsx", import.meta.url), "utf8"),
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

async function mount({ failure = false, rejection = false, empty = false } = {}) {
  const states = [];
  let cursor = 0;
  let effect;
  let shouldFail = failure;

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
    useEffect: fn => { effect = fn; },
  };

  function response() {
    if (shouldFail) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }

    return {
      data: empty
        ? []
        : [{ id: "staff-1", name: "黒木", created_at: "2026-09-28" }],
      error: null,
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Promise,
    console: { error() {} },
    alert() {},
    window: { confirm: () => true },
    require(name) {
      if (name === "react") return hooks;
      if (name === "next/link") return { default: "a" };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              assert.equal(table, "staffs");
              const chain = {
                select() { return chain; },
                order() { return chain; },
                insert() { return chain; },
                delete() { return chain; },
                eq() { return chain; },
                then(resolve, reject) {
                  return Promise.resolve().then(response).then(resolve, reject);
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
    html,
    hasAddButton() {
      return Boolean(
        findNode(
          tree(),
          node => node.type === "button" && node.props.children === "スタッフを追加"
        )
      );
    },
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

for (const rejection of [false, true]) {
  test(`staff management hides writes after ${rejection ? "rejection" : "query error"}`, async () => {
    const page = await mount({ failure: true, rejection });
    assert.match(page.html(), /role="alert"/);
    assert.doesNotMatch(page.html(), /0名|スタッフはまだ登録されていません/);
    assert.equal(page.hasAddButton(), false);
  });

  test(`staff management retries after ${rejection ? "rejection" : "query error"}`, async () => {
    const page = await mount({ failure: true, rejection });
    await page.retry();
    assert.doesNotMatch(page.html(), /role="alert"/);
    assert.match(page.html(), /黒木|1名/);
    assert.equal(page.hasAddButton(), true);
  });
}

test("staff management preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /0名|スタッフはまだ登録されていません/);
  assert.equal(page.hasAddButton(), true);
});

test("staff management renders a complete successful result", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /黒木|1名/);
  assert.equal(page.hasAddButton(), true);
});
