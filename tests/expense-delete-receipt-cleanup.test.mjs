import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
  readFileSync(new URL("../app/api/expenses/delete/route.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText;

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

async function runDelete({
  receiptUrl =
    "https://example.supabase.co/storage/v1/object/public/visit-photos/receipts/old%20receipt.jpg",
  expenseFetchError = null,
  deleteError = null,
  matchedError = null,
  restoreError = null,
  cleanupMode = "success",
} = {}) {
  const queries = [];
  const removals = [];
  const errors = [];

  const supabase = {
    storage: {
      from(bucket) {
        assert.equal(bucket, "visit-photos");
        return {
          remove(paths) {
            removals.push(Array.from(paths));
            if (cleanupMode === "reject") {
              return Promise.reject(new Error("storage offline"));
            }
            return Promise.resolve({
              error: cleanupMode === "error" ? { message: "cleanup failed" } : null,
            });
          },
        };
      },
    },
    from(table) {
      const query = { table, operation: "read", filters: [] };
      queries.push(query);

      const chain = {
        select(columns) {
          query.columns = columns;
          return chain;
        },
        delete() {
          query.operation = "delete";
          return chain;
        },
        update(payload) {
          query.operation = "update";
          query.payload = payload;
          return chain;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return chain;
        },
        in(column, values) {
          query.filters.push([column, Array.from(values)]);
          return chain;
        },
        single() {
          return Promise.resolve({
            data: expenseFetchError
              ? null
              : {
                  id: "expense-1",
                  source_import_row_id: "import-1",
                  receipt_url: receiptUrl,
                },
            error: expenseFetchError,
          });
        },
        then(resolve, reject) {
          let result;
          if (table === "expenses" && query.operation === "delete") {
            result = { error: deleteError };
          } else if (table === "expense_import_rows" && query.operation === "read") {
            result = {
              data: [{ id: "import-1" }, { id: "import-2" }],
              error: matchedError,
            };
          } else if (table === "expense_import_rows" && query.operation === "update") {
            result = { error: restoreError };
          } else {
            throw new Error(`Unexpected query: ${table}/${query.operation}`);
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };

      return chain;
    },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    Promise,
    URL,
    console: { error: (...args) => errors.push(args) },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      },
    },
    require(name) {
      if (name === "next/server") {
        return {
          NextResponse: {
            json(body, options = {}) {
              return new MockResponse(body, options.status ?? 200);
            },
          },
        };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient(url, key) {
            assert.equal(url, "https://example.supabase.co");
            assert.equal(key, "service-role-test");
            return supabase;
          },
        };
      }
      if (name === "@/lib/server/requireStaffSession") {
        return { requireStaffSession: async () => null };
      }
      if (name === "@/lib/expenseReceiptStorage") return storageHelperExports;
      return require(name);
    },
  });

  const response = await exports.POST({
    json: async () => ({ expenseId: "expense-1" }),
  });

  return {
    body: await response.json(),
    errors,
    queries,
    removals,
    status: response.status,
  };
}

test("expense deletion removes its stored receipt after the row is deleted", async () => {
  const result = await runDelete();

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.restoredCount, 2);
  assert.equal(result.body.receiptCleanupFailed, false);
  assert.deepEqual(result.removals, [["receipts/old receipt.jpg"]]);
  assert.equal(
    result.queries.find((query) => query.table === "expenses" && query.columns)?.columns,
    "id, source_import_row_id, receipt_url"
  );
});

test("expense deletion leaves a receipt from another origin untouched", async () => {
  const result = await runDelete({
    receiptUrl:
      "https://legacy.example/storage/v1/object/public/visit-photos/receipts/old.jpg",
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.removals, []);
  assert.equal(result.body.receiptCleanupFailed, false);
});

test("expense deletion ignores a same-origin URL outside the public receipt path", async () => {
  const result = await runDelete({
    receiptUrl:
      "https://example.supabase.co/legacy/storage/v1/object/public/visit-photos/receipts/old.jpg",
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.removals, []);
  assert.equal(result.body.receiptCleanupFailed, false);
});

test("expense deletion never removes a receipt when the database delete fails", async () => {
  const result = await runDelete({ deleteError: { message: "delete failed" } });

  assert.equal(result.status, 500);
  assert.match(result.body.error, /expenses削除に失敗しました/);
  assert.deepEqual(result.removals, []);
});

for (const cleanupMode of ["error", "reject"]) {
  test(`expense deletion stays successful after receipt cleanup ${cleanupMode}`, async () => {
    const result = await runDelete({ cleanupMode });

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.receiptCleanupFailed, true);
    assert.deepEqual(result.removals, [["receipts/old receipt.jpg"]]);
    assert.equal(result.errors.length, 1);
  });
}

test("expense deletion still cleans its receipt when import review restore fails", async () => {
  const result = await runDelete({ restoreError: { message: "restore failed" } });

  assert.equal(result.status, 500);
  assert.match(result.body.error, /review復元に失敗しました/);
  assert.deepEqual(result.removals, [["receipts/old receipt.jpg"]]);
});
