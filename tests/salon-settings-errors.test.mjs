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
  readFileSync(new URL("../app/settings/salon/page.tsx", import.meta.url), "utf8"),
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
  let saveFailure = false;
  let saveRejection = false;
  const alerts = [];
  const updates = [];

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

  function loadResponse() {
    if (shouldFail) {
      if (rejection) throw new Error("offline");
      return { data: null, error: { message: "read failed" } };
    }

    return {
      data: empty
        ? null
        : {
            id: "salon-1",
            name: "Aily Nail Studio",
            google_review_url: "https://example.com/review",
            instagram_url: null,
            hpb_url: null,
            minimo_url: null,
            line_url: "https://lin.ee/example",
          },
      error: null,
    };
  }

  function saveResponse() {
    if (saveRejection) throw new Error("offline");
    if (saveFailure) return { error: { message: "write failed" } };
    return { error: null };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    Promise,
    console: { error() {} },
    alert: value => alerts.push(value),
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              assert.equal(table, "salons");
              const chain = {
                select() { return chain; },
                limit() { return chain; },
                maybeSingle() {
                  return Promise.resolve().then(loadResponse);
                },
                update(value) {
                  updates.push(value);
                  return chain;
                },
                eq(column, value) {
                  assert.equal(column, "id");
                  assert.equal(value, "salon-1");
                  return Promise.resolve().then(saveResponse);
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
    alerts,
    html,
    tree,
    updates,
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
    async save({ failure: nextFailure = false, rejection: nextRejection = false } = {}) {
      saveFailure = nextFailure;
      saveRejection = nextRejection;
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "保存する"
      );
      assert.ok(button, "save button exists");
      const promise = button.props.onClick();
      assert.match(html(), /保存中/);
      await promise;
    },
  };
}

for (const rejection of [false, true]) {
  test(`salon settings hide the form after ${rejection ? "rejection" : "query error"}`, async () => {
    const page = await mount({ failure: true, rejection });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /店舗設定を取得できませんでした/);
    assert.match(page.html(), /誤った内容で上書きしないため/);
    assert.doesNotMatch(page.html(), /店舗情報が見つかりません|保存する/);
  });
}

test("salon settings recover after retry", async () => {
  const page = await mount({ failure: true });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"|店舗情報が見つかりません/);
  assert.match(page.html(), /Aily Nail Studio|保存する/);
});

test("salon settings preserve a successful missing result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"|再試行|保存する/);
  assert.match(page.html(), /店舗情報が見つかりません/);
});

test("salon settings save a complete successful result", async () => {
  const page = await mount();
  await page.save();
  assert.equal(page.alerts.at(-1), "店舗設定を保存しました");
  assert.equal(page.updates.length, 1);
  assert.equal(page.updates[0].name, "Aily Nail Studio");
  assert.equal(page.updates[0].line_url, "https://lin.ee/example");
  assert.match(page.html(), /保存する/);
});

for (const rejection of [false, true]) {
  test(`salon settings restore the save action after ${rejection ? "rejection" : "update error"}`, async () => {
    const page = await mount();
    await page.save({ failure: !rejection, rejection });
    assert.match(String(page.alerts.at(-1)), /店舗設定の保存に失敗しました/);
    assert.match(page.html(), /保存する/);
  });
}
