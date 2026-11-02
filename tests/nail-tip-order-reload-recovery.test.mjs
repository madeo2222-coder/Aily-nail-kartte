import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const pageSource = readFileSync(
  new URL("../app/customer-app/nail-tip-order/page.tsx", import.meta.url),
  "utf8"
);
const pageCompiled = ts.transpileModule(pageSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const helperSource = readFileSync(
  new URL("../lib/nail-tip-order-submission.ts", import.meta.url),
  "utf8"
);
const helperCompiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const submissionHelpers = {};
new Function("exports", "require", helperCompiled)(submissionHelpers, require);

const products = [
  {
    code: "ruby_love",
    name: "Ruby",
    stone: "Ruby",
    fortune: "Love",
    startingPrice: 10_000,
  },
  {
    code: "diamond_premium",
    name: "Diamond",
    stone: "Diamond",
    fortune: "Premium",
    startingPrice: 20_000,
  },
];

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
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

function mount({ storage = createStorage(), recoveryStatus = "unknown" } = {}) {
  const states = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let uuidCalls = 0;

  const hooks = {
    Suspense: ({ children }) => children,
    useCallback: fn => fn,
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
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useEffect: fn => effects.push(fn),
  };

  async function fetch(url, options = {}) {
    requests.push({ url, options });
    if (String(url).startsWith("/api/nail-tip-orders?")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, status: recoveryStatus };
        },
      };
    }
    if (url === "/api/nail-tip-orders") {
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, orderId: "order-1" };
        },
      };
    }
    throw new Error(`Unexpected request: ${url}`);
  }

  const exports = {};
  vm.runInNewContext(pageCompiled, {
    exports,
    Promise,
    URLSearchParams,
    console: { error() {} },
    fetch,
    window: {
      sessionStorage: storage,
      crypto: {
        randomUUID() {
          uuidCalls += 1;
          return "22222222-2222-4222-8222-222222222222";
        },
      },
      setTimeout() {},
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") {
        return {
          useSearchParams: () =>
            new URLSearchParams("color=red&stone=ruby&theme=love"),
        };
      }
      if (name === "@/lib/nail-tip-products/catalog") {
        return { NAIL_TIP_PRODUCTS: products };
      }
      if (name === "@/lib/nail-tip-order-submission") {
        return submissionHelpers;
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function tree() {
    cursor = 0;
    effects.length = 0;
    return exports.default().props.children.type();
  }

  function html() {
    return renderToStaticMarkup(tree());
  }

  return {
    storage,
    requests,
    html,
    uuidCalls: () => uuidCalls,
    async runEffects() {
      tree();
      const current = [...effects];
      await current[0]();
      current[1]();
      await setImmediate();
    },
    async submit() {
      const button = findNode(
        tree(),
        node =>
          node.type === "button" &&
          node.props.children === "この内容で注文相談する"
      );
      assert.ok(button);
      await button.props.onClick();
      await setImmediate();
    },
  };
}

const pending = {
  luckyColor: "red",
  luckyStone: "ruby",
  nailTheme: "love",
  productCode: "ruby_love",
  designRequest: "stored design",
  sizeStatus: "サイズ測定済み",
  deliveryRequest: "stored delivery",
  requestKey: "11111111-1111-4111-8111-111111111111",
};

function prepareUnknown(storage) {
  submissionHelpers.savePendingNailTipOrderSubmission(storage, pending);
  storage.setItem("aily.nailTipOrder.submissionState", "uncertain");
}

test("reload confirms a saved order without another POST", async () => {
  const storage = createStorage();
  prepareUnknown(storage);
  const page = mount({ storage, recoveryStatus: "saved" });
  await page.runEffects();

  assert.equal(page.requests.length, 1);
  assert.match(page.requests[0].url, /requestKey=11111111-/);
  assert.match(page.html(), /保存済みの注文相談を確認しました/);
  assert.equal(
    page.requests.filter(request => request.options.method === "POST").length,
    0
  );
});

test("reload restores and retries only the exact not-found order", async () => {
  const storage = createStorage();
  prepareUnknown(storage);
  const page = mount({ storage, recoveryStatus: "not_found" });
  await page.runEffects();

  assert.match(page.html(), /入力内容を復元しました/);
  await page.submit();

  const post = page.requests.find(request => request.options.method === "POST");
  assert.ok(post);
  assert.deepEqual(JSON.parse(post.options.body), pending);
  assert.equal(page.uuidCalls(), 0);
});

test("reload keeps an unknown order result locked", async () => {
  const storage = createStorage();
  prepareUnknown(storage);
  const page = mount({ storage, recoveryStatus: "unknown" });
  await page.runEffects();

  assert.match(page.html(), /二重注文を防ぐため再送を停止/);
  await page.submit();
  assert.equal(
    page.requests.filter(request => request.options.method === "POST").length,
    0
  );
});

test("unavailable recovery storage prevents an untracked POST", async () => {
  const storage = {
    getItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("storage unavailable");
    },
    removeItem() {
      throw new Error("storage unavailable");
    },
  };
  const page = mount({ storage });
  await page.runEffects();
  await page.submit();

  assert.equal(page.requests.length, 0);
  assert.match(page.html(), /安全に送信準備を保存できません/);
});
