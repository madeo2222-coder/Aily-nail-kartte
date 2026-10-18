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
    new URL("../app/expenses/review/page.tsx", import.meta.url),
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

const ROW_ID = "11111111-1111-4111-8111-111111111111";

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

async function mount() {
  const slots = [];
  const actionGate = deferred();
  const requests = [];
  let cursor = 0;
  let pendingEffects = [];
  let tree;

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) {
        slots[index] = typeof initial === "function" ? initial() : initial;
      }
      return [slots[index], (value) => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      const changed =
        !previous || deps.some((value, depIndex) => !Object.is(value, previous.deps[depIndex]));
      if (changed) slots[index] = { deps, value: fn() };
      return slots[index].value;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      const changed =
        !previous || deps.some((value, depIndex) => !Object.is(value, previous.deps[depIndex]));
      if (changed) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };

  const row = {
    id: ROW_ID,
    import_id: "import-1",
    expense_date: "2026-09-30",
    amount: 3800,
    vendor_raw: "備品店",
    description_raw: "消耗品",
    payment_method: "カード",
    receipt_status: "unchecked",
    review_status: "unreviewed",
    duplicate_flag: false,
    matched_expense_id: null,
    excluded_flag: false,
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Intl,
    Number,
    Promise,
    alert() {},
    console: { error() {} },
    fetch(url, options) {
      requests.push({ url, options });
      if (url === "/api/expenses/review") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, rows: [row] }),
        });
      }
      return actionGate.promise;
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function render() {
    cursor = 0;
    tree = exports.default();
    const effects = pendingEffects;
    pendingEffects = [];
    effects.forEach((effect) => effect());
  }

  async function settle() {
    await setImmediate();
    await setImmediate();
    render();
  }

  render();
  await settle();

  return {
    html() {
      return renderToStaticMarkup(tree);
    },
    requests,
    startStatusAndConfirm() {
      const statusButton = findNode(
        tree,
        (node) => node.type === "button" && node.props.children === "領収書あり"
      );
      const confirmButton = findNode(
        tree,
        (node) =>
          node.type === "button" &&
          node.props.children === "このカテゴリで正式経費に確定"
      );
      assert.ok(statusButton);
      assert.ok(confirmButton);
      statusButton.props.onClick();
      confirmButton.props.onClick();
      render();
    },
    async completeStatus() {
      actionGate.resolve({
        ok: true,
        json: async () => ({ ok: true, row: { ...row, receipt_status: "has_receipt" } }),
      });
      await settle();
    },
  };
}

test("expense review blocks overlapping row writes before React rerenders", async () => {
  const page = await mount();

  assert.match(page.html(), /このカテゴリで正式経費に確定/);
  page.startStatusAndConfirm();
  await setImmediate();

  const actionRequests = page.requests.filter(
    (request) => request.url !== "/api/expenses/review"
  );
  assert.equal(actionRequests.length, 1);
  assert.equal(actionRequests[0].url, "/api/expenses/review/update-status");
  assert.deepEqual(JSON.parse(actionRequests[0].options.body), {
    rowId: ROW_ID,
    receipt_status: "with_receipt",
  });
  assert.ok((page.html().match(/disabled=""/g) || []).length >= 7);

  await page.completeStatus();
  assert.match(page.html(), /このカテゴリで正式経費に確定/);
});
