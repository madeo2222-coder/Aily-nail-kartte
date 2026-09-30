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
    new URL("../app/expenses/import-rows/page.tsx", import.meta.url),
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
  const queryFilters = [];
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
    useCallback(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      const changed =
        !previous || deps.some((value, depIndex) => !Object.is(value, previous.deps[depIndex]));
      if (changed) slots[index] = { deps, value: fn };
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
    id: "row-1",
    import_id: "import-1",
    expense_date: "2026-09-30",
    amount: 3800,
    vendor_raw: "備品店",
    description_raw: "消耗品",
    payment_method: "カード",
    receipt_status: "attached",
    review_status: "unreviewed",
    duplicate_flag: false,
    excluded_flag: false,
    created_at: "2026-09-30T00:00:00Z",
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
      return actionGate.promise;
    },
    window: { confirm: () => true },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              assert.equal(table, "expense_import_rows");
              const chain = {
                select() {
                  return chain;
                },
                eq(column, value) {
                  queryFilters.push([column, value]);
                  return chain;
                },
                or(filter) {
                  queryFilters.push(["or", filter]);
                  return chain;
                },
                order() {
                  return chain;
                },
                limit() {
                  return Promise.resolve({ data: [row], error: null });
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
    queryFilters,
    requests,
    startApproveAndExclude() {
      const approve = findNode(
        tree,
        (node) => node.type === "button" && node.props.children === "正式登録"
      );
      const exclude = findNode(
        tree,
        (node) => node.type === "button" && node.props.children === "除外"
      );
      assert.ok(approve);
      assert.ok(exclude);
      const event = { preventDefault() {}, stopPropagation() {} };
      approve.props.onClick(event);
      exclude.props.onClick(event);
      render();
    },
    async completeApprove() {
      actionGate.resolve({
        ok: true,
        json: async () => ({ ok: true, expenseId: "expense-new" }),
      });
      await settle();
    },
  };
}

test("expense import actions hide confirmed rows and block overlapping writes", async () => {
  const page = await mount();

  assert.deepEqual(page.queryFilters, [
    ["excluded_flag", false],
    ["or", "review_status.eq.unreviewed,review_status.is.null"],
  ]);

  page.startApproveAndExclude();
  await setImmediate();

  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, "/api/expenses/import-rows/approve");
  assert.deepEqual(JSON.parse(page.requests[0].options.body), { rowId: "row-1" });
  assert.match(page.html(), /登録中\.\.\./);
  assert.equal((page.html().match(/disabled=""/g) || []).length, 2);

  await page.completeApprove();

  assert.doesNotMatch(page.html(), /備品店|正式登録|>除外</);
  assert.match(page.html(), /CSV取込候補はありません/);
});
