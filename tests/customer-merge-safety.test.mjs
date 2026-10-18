import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/api/customers/merge/route.ts", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText;

const SALON_ID = "11111111-1111-4111-8111-111111111111";
const KEEP_ID = "22222222-2222-4222-8222-222222222222";
const MERGE_ID = "33333333-3333-4333-8333-333333333333";

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

async function runMerge({
  authentication = {
    ok: true,
    principal: {
      authenticationMode: "supabase",
      salonId: SALON_ID,
      role: "owner",
    },
  },
  keepCustomer = {
    id: KEEP_ID,
    salon_id: SALON_ID,
    name: "残す顧客",
    phone: null,
    notes: "既存メモ",
  },
  mergeCustomer = {
    id: MERGE_ID,
    salon_id: SALON_ID,
    name: "統合元顧客",
    phone: "09000000000",
    notes: "統合元メモ",
  },
  failMoveTable = null,
} = {}) {
  let clientCreated = false;
  let authenticationOptions = null;
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
        update(payload, options) {
          query.operation = "update";
          query.payload = payload;
          query.options = options;
          return chain;
        },
        delete() {
          query.operation = "delete";
          return chain;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return chain;
        },
        maybeSingle() {
          if (table !== "customers") {
            throw new Error(`Unexpected maybeSingle query for ${table}`);
          }

          if (query.operation === "update") {
            return Promise.resolve({ data: { id: KEEP_ID }, error: null });
          }

          if (query.operation === "delete") {
            return Promise.resolve({ data: { id: MERGE_ID }, error: null });
          }

          const id = query.filters.find(([column]) => column === "id")?.[1];
          const salonId = query.filters.find(
            ([column]) => column === "salon_id"
          )?.[1];
          const customer = id === KEEP_ID ? keepCustomer : mergeCustomer;

          return Promise.resolve({
            data: customer?.salon_id === salonId ? customer : null,
            error: null,
          });
        },
        then(resolve, reject) {
          if (query.operation !== "update" || table === "customers") {
            throw new Error(`Unexpected awaited query: ${table}/${query.operation}`);
          }

          return Promise.resolve({
            count: table === failMoveTable ? null : 1,
            error:
              table === failMoveTable ? { message: "move failed" } : null,
          }).then(resolve, reject);
        },
      };

      return chain;
    },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    Object,
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
        return {
          createClient() {
            clientCreated = true;
            return supabase;
          },
        };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async (options) => {
            authenticationOptions = options;
            return authentication;
          },
        };
      }
      return require(name);
    },
  });

  const response = await exports.POST({
    json: async () => ({
      keepCustomerId: KEEP_ID,
      mergeCustomerId: MERGE_ID,
    }),
  });

  return {
    body: await response.json(),
    authenticationOptions,
    clientCreated,
    queries,
    status: response.status,
  };
}

test("customer merge rejects unauthenticated access before using service role", async () => {
  const result = await runMerge({
    authentication: { ok: false, status: 401, error: "スタッフ認証が必要です。" },
  });

  assert.equal(result.status, 401);
  assert.equal(result.clientCreated, false);
  assert.equal(result.queries.length, 0);
});

test("customer merge scopes both customers and destructive writes to the owner salon", async () => {
  const result = await runMerge();

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.authenticationOptions)),
    {
      allowedRoles: ["owner"],
      legacyAllowed: false,
      salonContextRequired: true,
    }
  );

  const customerReads = result.queries.filter(
    (query) => query.table === "customers" && query.operation === "read"
  );
  assert.equal(customerReads.length, 2);
  for (const query of customerReads) {
    assert.ok(
      query.filters.some(
        ([column, value]) => column === "salon_id" && value === SALON_ID
      )
    );
  }

  const customerWrites = result.queries.filter(
    (query) => query.table === "customers" && query.operation !== "read"
  );
  assert.deepEqual(
    customerWrites.map((query) => query.operation),
    ["update", "delete"]
  );
  for (const query of customerWrites) {
    assert.ok(
      query.filters.some(
        ([column, value]) => column === "salon_id" && value === SALON_ID
      )
    );
  }
});

test("customer merge stops before customer mutation when a relation move fails", async () => {
  const result = await runMerge({ failMoveTable: "visits" });

  assert.equal(result.status, 500);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.partialMove, true);
  assert.equal(result.body.retrySafe, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body.moved)), {
    reservations: 1,
  });
  assert.equal(
    result.queries.filter(
      (query) => query.table === "customers" && query.operation !== "read"
    ).length,
    0
  );
});

test("customer merge cannot read a customer from another salon", async () => {
  const result = await runMerge({
    mergeCustomer: {
      id: MERGE_ID,
      salon_id: "44444444-4444-4444-8444-444444444444",
      name: "別店舗顧客",
      phone: null,
      notes: null,
    },
  });

  assert.equal(result.status, 404);
  assert.equal(result.body.ok, false);
  assert.equal(
    result.queries.filter((query) => query.operation !== "read").length,
    0
  );
});

test("customer merge does not duplicate an existing merge history on retry", async () => {
  const existingNotes = `既存メモ\n統合元ID：${MERGE_ID}`;
  const result = await runMerge({
    keepCustomer: {
      id: KEEP_ID,
      salon_id: SALON_ID,
      name: "残す顧客",
      phone: null,
      notes: existingNotes,
    },
  });

  assert.equal(result.status, 200);
  const customerUpdate = result.queries.find(
    (query) => query.table === "customers" && query.operation === "update"
  );
  assert.equal(customerUpdate.payload.notes, existingNotes);
});
