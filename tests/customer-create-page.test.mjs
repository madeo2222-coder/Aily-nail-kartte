import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/customers/new/page.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function deferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function mount() {
  const states = [];
  const requests = [];
  const pushes = [];
  const alerts = [];
  const response = deferred();
  let cursor = 0;

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
  };
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    Error,
    JSON,
    Promise,
    alert(message) {
      alerts.push(message);
    },
    fetch(url, options) {
      requests.push({ url, options });
      return response.promise;
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/navigation") {
        return { useRouter: () => ({ push: (url) => pushes.push(url) }) };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function tree() {
    cursor = 0;
    return exports.default();
  }

  function change(id, value) {
    const input = findNode(tree(), (node) => node.props?.id === id);
    assert.ok(input);
    input.props.onChange({ target: { value } });
  }

  function submit() {
    const form = findNode(tree(), (node) => node.type === "form");
    assert.ok(form);
    return form.props.onSubmit({ preventDefault() {} });
  }

  return { alerts, change, pushes, requests, response, submit, states, tree };
}

test("customer registration uses the staff API and immediately blocks duplicate submits", async () => {
  const page = mount();
  page.change("name", " 山田 花子 ");
  page.change("phone", "090-1234-5678");

  const first = page.submit();
  const duplicate = page.submit();

  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, "/api/customers/staff-create");
  assert.equal(page.requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(page.requests[0].options.body), {
    name: "山田 花子",
    phone: "090-1234-5678",
  });

  page.response.resolve({
    ok: true,
    json: async () => ({ ok: true, id: "customer-1", existing: false }),
  });
  await Promise.all([first, duplicate]);
  await setImmediate();

  assert.deepEqual(page.pushes, ["/customers/customer-1"]);
  assert.deepEqual(page.alerts, []);
});

test("customer registration reopens an existing chart returned by the API", async () => {
  const page = mount();
  page.change("name", "既存 顧客");
  const submission = page.submit();
  page.response.resolve({
    ok: true,
    json: async () => ({ ok: true, id: "existing-1", existing: true }),
  });
  await submission;

  assert.deepEqual(page.alerts, [
    "同じ顧客が見つかったため、既存カルテを開きます。",
  ]);
  assert.deepEqual(page.pushes, ["/customers/existing-1"]);
});

test("customer registration keeps the form open with a safe API error", async () => {
  const page = mount();
  page.change("name", "顧客A");
  const submission = page.submit();
  page.response.resolve({
    ok: false,
    json: async () => ({ ok: false, error: "顧客を登録できませんでした。" }),
  });
  await submission;

  assert.deepEqual(page.pushes, []);
  assert.equal(page.states[3], "顧客を登録できませんでした。");
});

test("customer registration page has no direct Supabase data access", () => {
  assert.doesNotMatch(source, /@\/lib\/supabase|\.from\(["']customers["']\)/);
  assert.match(source, /\/api\/customers\/staff-create/);
});
