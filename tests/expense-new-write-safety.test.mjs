import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(new URL("../app/expenses/new/page.tsx", import.meta.url), "utf8"),
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

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function mount({ insertMode = "success", cleanupMode = "success", pauseUpload = false } = {}) {
  const states = [];
  const refs = [];
  const alerts = [];
  const pushes = [];
  const uploads = [];
  const inserts = [];
  const removals = [];
  const uploadGate = deferred();
  let cursor = 0;

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) {
        states[index] = typeof initial === "function" ? initial() : initial;
      }

      return [states[index], (value) => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
  };

  const storage = {
    upload(path, file, options) {
      uploads.push({ path, file, options });
      if (pauseUpload) return uploadGate.promise;
      return Promise.resolve({ error: null });
    },
    getPublicUrl(path) {
      return { data: { publicUrl: `https://storage.example/${path}` } };
    },
    remove(paths) {
      removals.push(paths);
      if (cleanupMode === "reject") return Promise.reject(new Error("cleanup offline"));
      if (cleanupMode === "error") {
        return Promise.resolve({ error: { message: "cleanup failed" } });
      }
      return Promise.resolve({ error: null });
    },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Error,
    Math,
    Number,
    Promise,
    alert(message) {
      alerts.push(message);
    },
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/navigation") {
        return { useRouter: () => ({ push: (path) => pushes.push(path) }) };
      }
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            storage: { from: () => storage },
            from(table) {
              assert.equal(table, "expenses");
              return {
                insert(payload) {
                  inserts.push(payload);
                  if (insertMode === "reject") return Promise.reject(new Error("insert offline"));
                  if (insertMode === "error") {
                    return Promise.resolve({ error: { message: "insert failed" } });
                  }
                  return Promise.resolve({ error: null });
                },
              };
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

  const file = { name: "receipt.jpg" };
  const fileInput = findNode(
    tree(),
    (node) => node.type === "input" && node.props.type === "file"
  );
  assert.ok(fileInput);
  fileInput.props.onChange({ target: { files: [file] } });

  const amountInput = findNode(
    tree(),
    (node) => node.type === "input" && node.props.type === "number"
  );
  assert.ok(amountInput);
  amountInput.props.onChange({ target: { value: "1200" } });

  const form = findNode(tree(), (node) => node.type === "form");
  assert.ok(form);

  return {
    alerts,
    form,
    inserts,
    pushes,
    removals,
    uploads,
    releaseUpload() {
      uploadGate.resolve({ error: null });
    },
  };
}

for (const insertMode of ["error", "reject"]) {
  test(`expense creation removes an uploaded receipt after ${insertMode}`, async () => {
    const page = mount({ insertMode });

    await page.form.props.onSubmit({ preventDefault() {} });

    assert.equal(page.uploads.length, 1);
    assert.equal(page.inserts.length, 1);
    assert.equal(page.removals.length, 1);
    assert.equal(page.removals[0].length, 1);
    assert.equal(page.removals[0][0], page.uploads[0].path);
    assert.equal(page.pushes.length, 0);
    assert.match(page.alerts.at(-1), /登録に失敗しました/);
  });
}

for (const cleanupMode of ["error", "reject"]) {
  test(`expense creation keeps the original failure after cleanup ${cleanupMode}`, async () => {
    const page = mount({ insertMode: "error", cleanupMode });

    await page.form.props.onSubmit({ preventDefault() {} });

    assert.equal(page.removals.length, 1);
    assert.match(page.alerts.at(-1), /insert failed/);
    assert.equal(page.pushes.length, 0);
  });
}

test("expense creation keeps the receipt after the expense is saved", async () => {
  const page = mount();

  await page.form.props.onSubmit({ preventDefault() {} });

  assert.equal(page.inserts.length, 1);
  assert.equal(page.removals.length, 0);
  assert.deepEqual(page.pushes, ["/expenses"]);
  assert.equal(page.alerts.at(-1), "登録しました");
});

test("expense creation immediately blocks a duplicate submit", async () => {
  const page = mount({ pauseUpload: true });

  const firstSubmit = page.form.props.onSubmit({ preventDefault() {} });
  const secondSubmit = page.form.props.onSubmit({ preventDefault() {} });
  await setImmediate();

  assert.equal(page.uploads.length, 1);
  assert.equal(page.inserts.length, 0);

  page.releaseUpload();
  await Promise.all([firstSubmit, secondSubmit]);

  assert.equal(page.inserts.length, 1);
  assert.equal(page.removals.length, 0);
  assert.deepEqual(page.pushes, ["/expenses"]);
});
