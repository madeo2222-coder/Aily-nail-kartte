import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/customers/[id]/edit/page.tsx", import.meta.url),
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

function mount({ loadStatus = 200 } = {}) {
  const states = [];
  const requests = [];
  const pushes = [];
  const alerts = [];
  const updateResponse = deferred();
  let cursor = 0;
  let effectHasRun = false;

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
    useCallback(callback) {
      return callback;
    },
    useEffect(callback) {
      if (!effectHasRun) {
        effectHasRun = true;
        callback();
      }
    },
  };
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    console: { error() {} },
    encodeURIComponent,
    Error,
    JSON,
    Promise,
    alert(message) {
      alerts.push(message);
    },
    fetch(url, options = {}) {
      requests.push({ url, options });
      if (!options.method) {
        return Promise.resolve({
          ok: loadStatus === 200,
          status: loadStatus,
          json: async () =>
            loadStatus === 200
              ? {
                  ok: true,
                  customer: {
                    id: "customer-1",
                    name: "顧客A",
                    name_kana: "コキャクエー",
                    phone: "+819012345678",
                  },
                }
              : { ok: false, error: "not found" },
        });
      }
      return updateResponse.promise;
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/navigation") {
        return {
          useParams: () => ({ id: "customer-1" }),
          useRouter: () => ({ push: (url) => pushes.push(url) }),
        };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function tree() {
    cursor = 0;
    return exports.default();
  }

  function change(placeholder, value) {
    const input = findNode(
      tree(),
      (node) => node.props?.placeholder === placeholder,
    );
    assert.ok(input);
    input.props.onChange({ target: { value } });
  }

  function submit() {
    const form = findNode(tree(), (node) => node.type === "form");
    assert.ok(form);
    return form.props.onSubmit({ preventDefault() {} });
  }

  return {
    alerts,
    change,
    pushes,
    requests,
    states,
    submit,
    tree,
    updateResponse,
  };
}

test("customer edit loads through the staff API and preserves not-found state", async () => {
  const page = mount({ loadStatus: 404 });
  page.tree();
  await setImmediate();

  assert.equal(
    page.requests[0].url,
    "/api/customers/customer-1/staff-edit",
  );
  assert.equal(page.requests[0].options.cache, "no-store");
  assert.equal(page.states[5], "not-found");
});

test("customer edit PATCH immediately blocks duplicate submits and opens the updated detail", async () => {
  const page = mount();
  page.tree();
  await setImmediate();
  page.change("顧客名", " 山田 花子 ");
  page.change("ヤマダ ハナコ", " ヤマダ ハナコ ");
  page.change("09012345678 または +819012345678", "090-9999-8888");

  const first = page.submit();
  const duplicate = page.submit();
  const writeRequests = page.requests.filter(
    (item) => item.options.method === "PATCH",
  );

  assert.equal(writeRequests.length, 1);
  assert.deepEqual(JSON.parse(writeRequests[0].options.body), {
    name: "山田 花子",
    nameKana: "ヤマダ ハナコ",
    phone: "090-9999-8888",
  });

  page.updateResponse.resolve({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, id: "customer-1" }),
  });
  await Promise.all([first, duplicate]);

  assert.deepEqual(page.alerts, ["顧客情報を更新しました"]);
  assert.deepEqual(page.pushes, ["/customers/customer-1"]);
});

test("customer edit keeps the form open after a safe API failure", async () => {
  const page = mount();
  page.tree();
  await setImmediate();
  const submission = page.submit();
  page.updateResponse.resolve({
    ok: false,
    status: 500,
    json: async () => ({ ok: false, error: "顧客情報を更新できませんでした。" }),
  });
  await submission;

  assert.deepEqual(page.pushes, []);
  assert.deepEqual(page.alerts, ["顧客情報を更新できませんでした。"]);
});

test("customer edit page has no direct Supabase data access", () => {
  assert.doesNotMatch(source, /@\/lib\/supabase|\.from\(["']customers["']\)/);
  assert.match(source, /\/api\/customers\/\$\{encodeURIComponent\(customerId\)\}\/staff-edit/);
});
