import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const storageHelperExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../lib/expenseReceiptStorage.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { exports: storageHelperExports, URL }
);
const compiled = ts.transpileModule(
  readFileSync(new URL("../app/expenses/[id]/page.tsx", import.meta.url), "utf8"),
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

async function mount({
  updateMode = "success",
  cleanupMode = "success",
  pauseUpload = false,
  pauseDelete = false,
  receiptUrl =
    "https://example.supabase.co/storage/v1/object/public/visit-photos/receipts/old%20receipt.jpg",
} = {}) {
  const values = [];
  const effects = [];
  const alerts = [];
  const pushes = [];
  const uploads = [];
  const updates = [];
  const removals = [];
  const deletes = [];
  const uploadGate = deferred();
  const deleteGate = deferred();
  let cursor = 0;

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
      return [values[index], (value) => {
        values[index] = typeof value === "function" ? value(values[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useCallback(fn) {
      cursor++;
      return fn;
    },
    useEffect(fn) {
      cursor++;
      effects.push(fn);
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

  const supabase = {
    storage: { from: () => storage },
    from(table) {
      assert.equal(table, "expenses");
      let operation = "read";
      const chain = {
        select() {
          return chain;
        },
        update(payload) {
          operation = "update";
          updates.push(payload);
          return chain;
        },
        eq() {
          if (operation !== "update") return chain;
          if (updateMode === "reject") return Promise.reject(new Error("update offline"));
          if (updateMode === "error") {
            return Promise.resolve({ error: { message: "update failed" } });
          }
          return Promise.resolve({ error: null });
        },
        async single() {
          return {
            data: {
              id: "expense-1",
              expense_date: "2026-09-30",
              category: "材料費",
              amount: 1200,
              memo: "消耗品",
              receipt_url: receiptUrl,
            },
            error: null,
          };
        },
      };
      return chain;
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
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" } },
    URL,
    alert(message) {
      alerts.push(message);
    },
    console: { error() {} },
    fetch(url, options) {
      deletes.push({ url, options });
      if (pauseDelete) return deleteGate.promise;
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/navigation") {
        return {
          useParams: () => ({ id: "expense-1" }),
          useRouter: () => ({ push: (path) => pushes.push(path) }),
        };
      }
      if (name === "@/lib/supabase") return { supabase };
      if (name === "@/lib/expenseReceiptStorage") return storageHelperExports;
      if (name === "../ExpenseReceiptImage") return { default: () => null };
      throw new Error(`Unexpected import: ${name}`);
    },
    window: { confirm: () => true },
  });

  function tree() {
    cursor = 0;
    return exports.default();
  }

  tree();
  for (const effect of effects.splice(0)) effect();
  await setImmediate();
  await setImmediate();

  const file = { name: "replacement.jpg" };
  const fileInput = findNode(
    tree(),
    (node) => node.type === "input" && node.props.type === "file"
  );
  assert.ok(fileInput);
  fileInput.props.onChange({ target: { files: [file] } });

  const currentTree = tree();
  const form = findNode(currentTree, (node) => node.type === "form");
  const deleteButton = findNode(
    currentTree,
    (node) => node.type === "button" && node.props.children === "削除する"
  );
  assert.ok(form);
  assert.ok(deleteButton);

  return {
    alerts,
    deletes,
    deleteButton,
    form,
    pushes,
    removals,
    updates,
    uploads,
    releaseDelete() {
      deleteGate.resolve({ ok: true, json: async () => ({ ok: true }) });
    },
    releaseUpload() {
      uploadGate.resolve({ error: null });
    },
  };
}

for (const updateMode of ["error", "reject"]) {
  test(`expense editing removes a replacement receipt after update ${updateMode}`, async () => {
    const page = await mount({ updateMode });

    await page.form.props.onSubmit({ preventDefault() {} });

    assert.equal(page.uploads.length, 1);
    assert.equal(page.updates.length, 1);
    assert.equal(page.removals.length, 1);
    assert.equal(page.removals[0].length, 1);
    assert.equal(page.removals[0][0], page.uploads[0].path);
    assert.deepEqual(page.pushes, []);
    assert.match(page.alerts.at(-1), /保存に失敗しました/);
  });
}

for (const cleanupMode of ["error", "reject"]) {
  test(`expense editing keeps the update failure after cleanup ${cleanupMode}`, async () => {
    const page = await mount({ updateMode: "error", cleanupMode });

    await page.form.props.onSubmit({ preventDefault() {} });

    assert.equal(page.removals.length, 1);
    assert.match(page.alerts.at(-1), /update failed/);
    assert.deepEqual(page.pushes, []);
  });
}

test("expense editing removes the old receipt after a successful replacement", async () => {
  const page = await mount();

  await page.form.props.onSubmit({ preventDefault() {} });

  assert.equal(page.updates.length, 1);
  assert.equal(page.removals.length, 1);
  assert.equal(page.removals[0][0], "receipts/old receipt.jpg");
  assert.deepEqual(page.pushes, ["/expenses"]);
  assert.equal(page.alerts.at(-1), "更新しました");
});

for (const cleanupMode of ["error", "reject"]) {
  test(`expense editing keeps a successful update after old receipt cleanup ${cleanupMode}`, async () => {
    const page = await mount({ cleanupMode });

    await page.form.props.onSubmit({ preventDefault() {} });

    assert.equal(page.updates.length, 1);
    assert.equal(page.removals.length, 1);
    assert.equal(page.removals[0][0], "receipts/old receipt.jpg");
    assert.deepEqual(page.pushes, ["/expenses"]);
    assert.equal(page.alerts.at(-1), "更新しました");
  });
}

test("expense editing leaves an external old receipt untouched", async () => {
  const page = await mount({ receiptUrl: "https://legacy.example/receipt.jpg" });

  await page.form.props.onSubmit({ preventDefault() {} });

  assert.equal(page.updates.length, 1);
  assert.equal(page.removals.length, 0);
  assert.deepEqual(page.pushes, ["/expenses"]);
  assert.equal(page.alerts.at(-1), "更新しました");
});

test("expense editing immediately blocks duplicate saves and deletion", async () => {
  const page = await mount({ pauseUpload: true });

  const firstSave = page.form.props.onSubmit({ preventDefault() {} });
  const duplicateSave = page.form.props.onSubmit({ preventDefault() {} });
  const overlappingDelete = page.deleteButton.props.onClick();
  await setImmediate();

  assert.equal(page.uploads.length, 1);
  assert.equal(page.updates.length, 0);
  assert.equal(page.deletes.length, 0);

  page.releaseUpload();
  await Promise.all([firstSave, duplicateSave, overlappingDelete]);

  assert.equal(page.updates.length, 1);
  assert.equal(page.removals.length, 1);
  assert.equal(page.removals[0][0], "receipts/old receipt.jpg");
  assert.deepEqual(page.pushes, ["/expenses"]);
});

test("expense deletion immediately blocks an overlapping save", async () => {
  const page = await mount({ pauseDelete: true });

  const deletion = page.deleteButton.props.onClick();
  const overlappingSave = page.form.props.onSubmit({ preventDefault() {} });
  await setImmediate();

  assert.equal(page.deletes.length, 1);
  assert.equal(page.uploads.length, 0);
  assert.equal(page.updates.length, 0);

  page.releaseDelete();
  await Promise.all([deletion, overlappingSave]);

  assert.deepEqual(page.pushes, ["/expenses"]);
});
