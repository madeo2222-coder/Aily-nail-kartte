import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/api/expenses/import-rows/approve/route.ts", import.meta.url),
    "utf8"
  ),
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

async function runApprove({
  row = {
    id: "row-1",
    expense_date: "2026-09-30",
    amount: 3800,
    vendor_raw: "備品店",
    description_raw: "消耗品",
    review_status: "unreviewed",
    matched_expense_id: null,
    excluded_flag: false,
  },
  rowError = null,
  existingExpense = null,
  existingExpenseError = null,
  insertError = null,
  updateMode = "success",
  reconciliationMode = "unmatched",
  rollbackMode = "success",
  repairError = null,
} = {}) {
  const queries = [];

  const supabase = {
    from(table) {
      const query = {
        table,
        operation: "read",
        filters: [],
      };
      queries.push(query);

      const chain = {
        select(columns) {
          query.select = columns;
          return chain;
        },
        insert(payload) {
          query.operation = "insert";
          query.payload = payload;
          return chain;
        },
        update(payload) {
          query.operation = "update";
          query.payload = payload;
          return chain;
        },
        delete() {
          query.operation = "delete";
          return chain;
        },
        eq(column, value) {
          query.filters.push([column, "eq", value]);
          return chain;
        },
        is(column, value) {
          query.filters.push([column, "is", value]);
          return chain;
        },
        single() {
          if (table === "expense_import_rows" && query.operation === "read") {
            return Promise.resolve({ data: rowError ? null : row, error: rowError });
          }
          if (table === "expenses" && query.operation === "insert") {
            return Promise.resolve({
              data: insertError ? null : { id: "expense-new" },
              error: insertError,
            });
          }
          throw new Error(`Unexpected single query: ${table}/${query.operation}`);
        },
        maybeSingle() {
          if (table === "expenses" && query.operation === "read") {
            return Promise.resolve({
              data: existingExpense,
              error: existingExpenseError,
            });
          }
          if (table === "expense_import_rows" && query.operation === "read") {
            if (reconciliationMode === "reject") {
              return Promise.reject(new Error("reconciliation offline"));
            }
            return Promise.resolve({
              data:
                reconciliationMode === "matched"
                  ? {
                      matched_expense_id: "expense-new",
                      review_status: "confirmed",
                    }
                  : reconciliationMode === "other"
                    ? {
                        matched_expense_id: "expense-other",
                        review_status: "confirmed",
                      }
                    : {
                        matched_expense_id: null,
                        review_status: "unreviewed",
                      },
              error:
                reconciliationMode === "error"
                  ? { message: "reconciliation failed" }
                  : null,
            });
          }
          if (table === "expense_import_rows" && query.operation === "update") {
            if (updateMode === "reject") {
              return Promise.reject(new Error("candidate update offline"));
            }
            return Promise.resolve({
              data: updateMode === "success" ? { id: row.id } : null,
              error:
                updateMode === "error"
                  ? { message: "candidate update failed" }
                  : null,
            });
          }
          throw new Error(`Unexpected maybeSingle query: ${table}/${query.operation}`);
        },
        then(resolve, reject) {
          if (table === "expenses" && query.operation === "delete") {
            if (rollbackMode === "reject") {
              return Promise.reject(new Error("rollback offline")).then(resolve, reject);
            }
            return Promise.resolve({
              error:
                rollbackMode === "error" ? { message: "rollback failed" } : null,
            }).then(resolve, reject);
          }
          if (table === "expense_import_rows" && query.operation === "update") {
            return Promise.resolve({ error: repairError }).then(resolve, reject);
          }
          throw new Error(`Unexpected awaited query: ${table}/${query.operation}`);
        },
      };

      return chain;
    },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    Number,
    Promise,
    console: { error() {} },
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
        return { createClient: () => supabase };
      }
      if (name === "@/lib/server/requireStaffSession") {
        return { requireStaffSession: async () => null };
      }
      return require(name);
    },
  });

  const response = await exports.POST({
    json: async () => ({ rowId: "row-1" }),
  });

  return {
    body: await response.json(),
    queries,
    status: response.status,
  };
}

test("expense import approval claims the candidate after creating one expense", async () => {
  const result = await runApprove();

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.expenseId, "expense-new");

  const insert = result.queries.find(
    (query) => query.table === "expenses" && query.operation === "insert"
  );
  assert.equal(insert.payload.amount, 3800);
  assert.equal(insert.payload.source_import_row_id, "row-1");

  const claim = result.queries.find(
    (query) => query.table === "expense_import_rows" && query.operation === "update"
  );
  assert.deepEqual(claim.filters, [
    ["id", "eq", "row-1"],
    ["excluded_flag", "eq", false],
    ["matched_expense_id", "is", null],
  ]);
  assert.equal(claim.select, "id");
  assert.equal(
    result.queries.filter((query) => query.operation === "delete").length,
    0
  );
});

for (const updateMode of ["error", "reject", "missing"]) {
  test(`expense import approval rolls back its insert after candidate ${updateMode}`, async () => {
    const result = await runApprove({ updateMode });

    assert.equal(result.status, 409);
    assert.match(result.body.error, /経費登録を取り消しました/);
    const rollback = result.queries.find(
      (query) => query.table === "expenses" && query.operation === "delete"
    );
    assert.deepEqual(rollback.filters, [["id", "eq", "expense-new"]]);
    assert.equal(result.body.repairRequired, undefined);
  });
}

test("expense import approval preserves a claim completed before a network error", async () => {
  const result = await runApprove({
    updateMode: "reject",
    reconciliationMode: "matched",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.reconciledAfterNetworkError, true);
  assert.equal(
    result.queries.filter((query) => query.operation === "delete").length,
    0
  );
});

for (const reconciliationMode of ["error", "reject"]) {
  test(`expense import approval avoids destructive rollback when reconciliation ${reconciliationMode}`, async () => {
    const result = await runApprove({
      updateMode: "reject",
      reconciliationMode,
    });

    assert.equal(result.status, 500);
    assert.equal(result.body.repairRequired, true);
    assert.equal(result.body.expenseId, "expense-new");
    assert.equal(
      result.queries.filter((query) => query.operation === "delete").length,
      0
    );
  });
}

for (const rollbackMode of ["error", "reject"]) {
  test(`expense import approval reports repair details after rollback ${rollbackMode}`, async () => {
    const result = await runApprove({ updateMode: "error", rollbackMode });

    assert.equal(result.status, 500);
    assert.equal(result.body.repairRequired, true);
    assert.equal(result.body.expenseId, "expense-new");
  });
}

test("expense import approval is idempotent when its expense already exists", async () => {
  const result = await runApprove({
    row: {
      id: "row-1",
      expense_date: "2026-09-30",
      amount: 3800,
      vendor_raw: "備品店",
      description_raw: "消耗品",
      review_status: "confirmed",
      matched_expense_id: "expense-existing",
      excluded_flag: false,
    },
    existingExpense: { id: "expense-existing" },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.alreadyApproved, true);
  assert.equal(result.body.expenseId, "expense-existing");
  assert.equal(
    result.queries.filter((query) => query.operation === "insert").length,
    0
  );
});

test("expense import approval stops a confirmed candidate without a link", async () => {
  const result = await runApprove({
    row: {
      id: "row-1",
      expense_date: "2026-09-30",
      amount: 3800,
      vendor_raw: "備品店",
      description_raw: "消耗品",
      review_status: "confirmed",
      matched_expense_id: null,
      excluded_flag: false,
    },
  });

  assert.equal(result.status, 409);
  assert.match(result.body.error, /紐づきがありません/);
  assert.equal(
    result.queries.filter((query) => query.operation === "insert").length,
    0
  );
});

test("expense import approval rejects an invalid amount before any write", async () => {
  const result = await runApprove({
    row: {
      id: "row-1",
      expense_date: "2026-09-30",
      amount: 0,
      vendor_raw: "備品店",
      description_raw: "消耗品",
      review_status: "unreviewed",
      matched_expense_id: null,
      excluded_flag: false,
    },
  });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /金額が不正/);
  assert.equal(
    result.queries.filter((query) => query.operation === "insert").length,
    0
  );
});
