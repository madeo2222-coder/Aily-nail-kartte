import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/api/expenses/review/route.ts", import.meta.url),
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

async function runList({ authenticated }) {
  let clientCreated = false;
  const filters = [];
  const authResponse = new MockResponse({ error: "認証が必要です" }, 401);

  const query = {
    select() {
      return query;
    },
    or(filter) {
      filters.push(filter);
      return query;
    },
    order() {
      return Promise.resolve({ data: [], error: null });
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
        return {
          createClient() {
            clientCreated = true;
            return { from: () => query };
          },
        };
      }
      if (name === "@/lib/server/requireStaffSession") {
        return {
          requireStaffSession: async () =>
            authenticated ? null : authResponse,
        };
      }
      return require(name);
    },
  });

  const response = await exports.GET({});
  return {
    body: await response.json(),
    clientCreated,
    filters,
    status: response.status,
  };
}

test("expense review list rejects unauthenticated access before using service role", async () => {
  const result = await runList({ authenticated: false });

  assert.equal(result.status, 401);
  assert.equal(result.clientCreated, false);
});

test("expense review list returns only pending rows after authentication", async () => {
  const result = await runList({ authenticated: true });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.clientCreated, true);
  assert.deepEqual(result.filters, [
    "review_status.eq.unreviewed,review_status.is.null",
  ]);
});
