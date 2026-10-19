import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/api/visits/[id]/photos/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const VISIT_ID = "40000000-0000-4000-8000-000000000004";
const SALON_ID = "30000000-0000-4000-8000-000000000003";
const OTHER_SALON_ID = "30000000-0000-4000-8000-000000000099";
const PHOTO_URL = `https://example.supabase.co/storage/v1/object/public/visit-photos/${VISIT_ID}/photo-50000000-0000-4000-8000-000000000005.jpg`;

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

function principal(authenticationMode = "supabase") {
  return authenticationMode === "supabase"
    ? {
        ok: true,
        principal: {
          authenticationMode: "supabase",
          staffId: "staff-1",
          salonId: SALON_ID,
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
  visitResult = {
    data: [{ id: VISIT_ID, salon_id: SALON_ID }],
    error: null,
  },
  photoResult = { data: null, error: null },
} = {}) {
  const calls = [];
  let authOptions = null;
  let clientCreated = false;

  function from(table) {
    const call = { table, filters: [], inserts: [] };
    calls.push(call);
    const query = {
      select(columns) {
        call.select = columns;
        return query;
      },
      eq(column, value) {
        call.filters.push({ column, value });
        return query;
      },
      limit(value) {
        call.limit = value;
        return Promise.resolve(visitResult);
      },
      insert(rows) {
        call.inserts.push(rows);
        return Promise.resolve(photoResult);
      },
    };
    return query;
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Request,
    URL,
    Set,
    Promise,
    decodeURIComponent,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      },
    },
    require(name) {
      if (name === "server-only") return {};
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

  async function post({ salonId = SALON_ID, imageUrl = PHOTO_URL } = {}) {
    return exports.POST(
      new Request(`https://app.example/api/visits/${VISIT_ID}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          photos: [{ imageUrl, photoType: "after" }],
        }),
      }),
      { params: Promise.resolve({ id: VISIT_ID }) },
    );
  }

  return {
    calls,
    post,
    get authOptions() {
      return authOptions;
    },
    get clientCreated() {
      return clientCreated;
    },
  };
}

test("photo metadata API rejects unauthenticated writes before service-role access", async () => {
  const runtime = executeRoute({
    authentication: {
      ok: false,
      status: 401,
      error: "スタッフ認証が必要です。",
    },
  });

  const response = await runtime.post();

  assert.equal(response.status, 401);
  assert.equal(runtime.clientCreated, false);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.authOptions)), {
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });
});

test("photo metadata API scopes individual staff writes to the authenticated salon", async () => {
  const runtime = executeRoute();
  const response = await runtime.post();
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.photoCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[0].filters)), [
    { column: "id", value: VISIT_ID },
    { column: "salon_id", value: SALON_ID },
  ]);
  assert.equal(runtime.calls[1].table, "visit_photos");
  assert.equal(runtime.calls[1].inserts[0][0].image_url, PHOTO_URL);
});

test("photo metadata API rejects a forged cross-salon write before reading visits", async () => {
  const runtime = executeRoute();
  const response = await runtime.post({ salonId: OTHER_SALON_ID });

  assert.equal(response.status, 403);
  assert.equal(runtime.calls.length, 0);
});

test("photo metadata API keeps signed shared-login photo writes available", async () => {
  const runtime = executeRoute({ authentication: principal("legacy") });
  const response = await runtime.post();

  assert.equal(response.status, 201);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls[0].filters)), [
    { column: "id", value: VISIT_ID },
  ]);
});

test("photo metadata API rejects URLs outside the visit storage path", async () => {
  const runtime = executeRoute();
  const response = await runtime.post({
    imageUrl: "https://attacker.example/photo.jpg",
  });

  assert.equal(response.status, 400);
  assert.equal(runtime.calls.length, 0);
});

test("photo metadata API fails closed when the visit cannot be verified", async () => {
  const runtime = executeRoute({
    visitResult: { data: null, error: { message: "read failed" } },
  });
  const response = await runtime.post();

  assert.equal(response.status, 404);
  assert.equal(runtime.calls.length, 1);
});

test("photo metadata API reports an insert failure without claiming success", async () => {
  const runtime = executeRoute({
    photoResult: { data: null, error: { message: "insert failed" } },
  });
  const response = await runtime.post();

  assert.equal(response.status, 500);
  assert.equal(runtime.calls.length, 2);
});
