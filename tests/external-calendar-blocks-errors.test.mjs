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
    new URL("../app/external-calendar-blocks/page.tsx", import.meta.url),
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

  function staffResponse() {
    if (shouldFail) {
      if (rejection) throw new Error("offline");
      return {
        ok: false,
        json: async () => ({ ok: false, error: "read failed" }),
      };
    }

    return {
      ok: true,
      json: async () => ({
        ok: true,
        staffs: empty
          ? []
          : [{ id: "staff-1", name: "黒木", salon_id: "salon-1" }],
      }),
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    console: { error() {} },
    fetch: async (_url, options = {}) =>
      options.method === "POST"
        ? { ok: true, json: async () => ({ ok: true }) }
        : staffResponse(),
    alert() {},
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
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

  assert.match(html(), /スタッフ情報を読み込み中/);
  effect();
  await setImmediate();

  return {
    html,
    hasSaveButton() {
      return Boolean(
        findNode(
          tree(),
          node => node.type === "button" && node.props.children === "ブロック登録"
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
      assert.match(html(), /スタッフ情報を読み込み中/);
      await setImmediate();
    },
  };
}

for (const rejection of [false, true]) {
  test(`external calendar blocks hides the form after ${rejection ? "rejection" : "query error"}`, async () => {
    const page = await mount({ failure: true, rejection });
    assert.match(page.html(), /role="alert"/);
    assert.equal(page.hasSaveButton(), false);
  });
}

test("external calendar blocks recovers after retry", async () => {
  const page = await mount({ failure: true });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /黒木/);
  assert.equal(page.hasSaveButton(), true);
});

test("external calendar blocks distinguishes a successful empty staff list", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /有効なスタッフが登録されていません/);
  assert.equal(page.hasSaveButton(), false);
});
