import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/customers/[id]/staff-edit/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const SALON_ID = "e120ed90-fded-41b8-b3fe-f486e84f2418";
const CUSTOMER_ID = "959aaf53-1ac5-41fe-8a5e-567d49f83ee5";

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

function principal(authenticationMode = "supabase", salonId = SALON_ID) {
  return authenticationMode === "supabase"
    ? {
        ok: true,
        principal: {
          authenticationMode: "supabase",
          staffId: "staff-1",
          salonId,
          role: "staff",
          isActive: true,
        },
      }
    : {
        ok: true,
        principal: {
          authenticationMode: "legacy",
          staffId: null,
          salonId: null,
          role: "staff",
          isActive: null,
        },
      };
}

function executeRoute({
  authentication = principal(),
  readResult = {
    data: { id: CUSTOMER_ID, name: "顧客A", name_kana: null, phone: null },
    error: null,
  },
  updateResult = { data: { id: CUSTOMER_ID }, error: null },
} = {}) {
  const calls = [];
  let authOptions = null;
  let clientCreated = false;

  function from(table) {
    const call = { table, filters: [], operation: "read", payload: null };
    calls.push(call);
    const query = {
      select(columns) {
        call.select = columns;
        return query;
      },
      update(payload) {
        call.operation = "update";
        call.payload = payload;
        return query;
      },
      eq(column, value) {
        call.filters.push({ column, value });
        return query;
      },
      maybeSingle() {
        return Promise.resolve(
          call.operation === "update" ? updateResult : readResult,
        );
      },
    };
    return query;
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    Promise,
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
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async (options) => {
            authOptions = options;
            return authentication;
          },
        };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            clientCreated = true;
            return { from };
          },
        };
      }
      return require(name);
    },
  });

  return {
    exports,
    calls,
    get authOptions() {
      return authOptions;
    },
    get clientCreated() {
      return clientCreated;
    },
  };
}

function context(id = CUSTOMER_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(body) {
  return { json: async () => body };
}

for (const method of ["GET", "PATCH"]) {
  test(`customer edit ${method} rejects unauthenticated access before service-role use`, async () => {
    const runtime = executeRoute({
      authentication: {
        ok: false,
        status: 401,
        error: "スタッフ認証が必要です。",
      },
    });
    const response =
      method === "GET"
        ? await runtime.exports.GET({}, context())
        : await runtime.exports.PATCH(request({ name: "顧客A" }), context());

    assert.equal(response.status, 401);
    assert.equal(runtime.clientCreated, false);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions)), {
      allowedRoles: ["owner", "staff"],
      legacyAllowed: true,
      salonContextRequired: false,
    });
  });
}

test("customer edit GET scopes an individual staff read to the authenticated salon", async () => {
  const runtime = executeRoute();
  const response = await runtime.exports.GET({}, context());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.customer.id, CUSTOMER_ID);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[0].filters)), [
    { column: "id", value: CUSTOMER_ID },
    { column: "salon_id", value: SALON_ID },
  ]);
});

test("customer edit PATCH scopes the update and normalizes the phone on the server", async () => {
  const runtime = executeRoute();
  const response = await runtime.exports.PATCH(
    request({
      name: " 山田 花子 ",
      nameKana: " ヤマダ ハナコ ",
      phone: "090-1234-5678",
    }),
    context(),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.id, CUSTOMER_ID);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[0].payload)), {
    name: "山田 花子",
    name_kana: "ヤマダ ハナコ",
    phone: "+819012345678",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[0].filters)), [
    { column: "id", value: CUSTOMER_ID },
    { column: "salon_id", value: SALON_ID },
  ]);
});

for (const method of ["GET", "PATCH"]) {
  test(`customer edit ${method} preserves the signed shared-login flow`, async () => {
    const runtime = executeRoute({ authentication: principal("legacy") });
    const response =
      method === "GET"
        ? await runtime.exports.GET({}, context())
        : await runtime.exports.PATCH(
            request({ name: "共有 顧客", nameKana: "", phone: "" }),
            context(),
          );

    assert.equal(response.status, 200);
    assert.equal(
      runtime.calls[0].filters.some((filter) => filter.column === "salon_id"),
      false,
    );
  });
}

test("customer edit refuses individual access when salon context is missing", async () => {
  const runtime = executeRoute({ authentication: principal("supabase", null) });
  const response = await runtime.exports.GET({}, context());

  assert.equal(response.status, 403);
  assert.equal(runtime.clientCreated, false);
});

test("customer edit validates PATCH input before service-role use", async () => {
  const runtime = executeRoute();
  const response = await runtime.exports.PATCH(
    request({ name: "　", nameKana: "", phone: "" }),
    context(),
  );

  assert.equal(response.status, 400);
  assert.equal(runtime.clientCreated, false);
});

for (const method of ["GET", "PATCH"]) {
  test(`customer edit ${method} returns not found outside the allowed scope`, async () => {
    const runtime = executeRoute({
      readResult: { data: null, error: null },
      updateResult: { data: null, error: null },
    });
    const response =
      method === "GET"
        ? await runtime.exports.GET({}, context())
        : await runtime.exports.PATCH(
            request({ name: "顧客A", nameKana: "", phone: "" }),
            context(),
          );

    assert.equal(response.status, 404);
  });
}

for (const method of ["GET", "PATCH"]) {
  test(`customer edit ${method} fails closed on a database error`, async () => {
    const runtime = executeRoute({
      readResult: { data: null, error: { message: "read failed" } },
      updateResult: { data: null, error: { message: "write failed" } },
    });
    const response =
      method === "GET"
        ? await runtime.exports.GET({}, context())
        : await runtime.exports.PATCH(
            request({ name: "顧客A", nameKana: "", phone: "" }),
            context(),
          );
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
  });
}
