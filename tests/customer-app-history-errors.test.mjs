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
    new URL("../app/customer-app/history/page.tsx", import.meta.url),
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

async function mount({ mode = "success" } = {}) {
  const states = [];
  let cursor = 0;
  let effect;
  let currentMode = mode;
  let requests = 0;

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
    useMemo: fn => fn(),
    useEffect: fn => { effect = fn; },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Intl,
    Map,
    Promise,
    URLSearchParams,
    console: { error() {} },
    async fetch(url, init) {
      assert.equal(url, "/api/line-login/customer-history");
      assert.equal(init.cache, "no-store");
      requests += 1;

      if (currentMode === "network-error") throw new Error("offline");
      if (currentMode === "invalid-json") {
        return { ok: true, status: 200, json: async () => { throw new Error("invalid json"); } };
      }
      if (currentMode === "server-error") {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: "履歴APIエラー" }),
        };
      }
      if (currentMode === "signed-out") {
        return {
          ok: false,
          status: 401,
          json: async () => ({ ok: false, authenticated: false }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          authenticated: true,
          customer: { id: "customer-1", name: "顧客A" },
          visits: [],
          visitPhotos: [],
          reservations: [],
          diagnoses: [],
          nailTipOrders: [],
        }),
      };
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "../CustomerPhoto") return { default: "img" };
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
  effect();
  await setImmediate();

  return {
    get requests() { return requests; },
    html,
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button, "retry button exists");
      currentMode = "success";
      button.props.onClick();
      html();
      effect();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
  };
}

for (const mode of ["network-error", "invalid-json", "server-error"]) {
  test(`customer history separates ${mode} from signed-out and empty states`, async () => {
    const page = await mount({ mode });
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /再試行/);
    assert.doesNotMatch(page.html(), /LINEでログイン/);
    assert.doesNotMatch(page.html(), /0回|予約中データはありません|まだ来店履歴がありません/);
  });
}

test("customer history keeps an explicit signed-out response as login guidance", async () => {
  const page = await mount({ mode: "signed-out" });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /LINEでログイン/);
});

test("customer history retries a failed read and preserves a legitimate empty result", async () => {
  const page = await mount({ mode: "network-error" });
  await page.retry();

  assert.equal(page.requests, 2);
  assert.doesNotMatch(page.html(), /role="alert"|LINEでログイン/);
  assert.match(page.html(), /顧客A様/);
  assert.match(page.html(), /0回/);
  assert.match(page.html(), /予約中データはありません/);
  assert.match(page.html(), /まだ来店履歴がありません/);
});
