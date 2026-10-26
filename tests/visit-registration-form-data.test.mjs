import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

const statusExports = {};
vm.runInNewContext(compile("../lib/reservation-status.ts"), {
  exports: statusExports,
  Set,
  String,
  require,
});

const compiled = compile("../lib/server/visitRegistrationFormData.ts");
const SALON_ID = "10000000-0000-4000-8000-000000000001";
const RESERVATION_ID = "20000000-0000-4000-8000-000000000002";
const CUSTOMER_ID = "30000000-0000-4000-8000-000000000003";
const STAFF_ID = "40000000-0000-4000-8000-000000000004";

function execute(status) {
  const results = {
    customers: {
      data: [{ id: CUSTOMER_ID, name: "顧客A" }],
      error: null,
    },
    staffs: {
      data: [{ id: STAFF_ID, name: "担当A" }],
      error: null,
    },
    reservations: {
      data: [
        {
          id: RESERVATION_ID,
          salon_id: SALON_ID,
          customer_id: CUSTOMER_ID,
          staff_id: STAFF_ID,
          status,
          menu: "ワンカラー",
          start_at: "2099-10-02T01:30:00.000Z",
          memo: "来店時に確認",
        },
      ],
      error: null,
    },
  };

  function query(table) {
    const value = results[table];
    const chain = {
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      then(resolve, reject) {
        return Promise.resolve(value).then(resolve, reject);
      },
    };
    return chain;
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Intl,
    Map,
    Number,
    Promise,
    RegExp,
    String,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
      },
    },
    require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/reservation-status") return statusExports;
      if (name === "@supabase/supabase-js") {
        return { createClient: () => ({ from: query }) };
      }
      return require(name);
    },
  });

  return exports.loadVisitRegistrationFormData({
    salonId: SALON_ID,
    reservationId: RESERVATION_ID,
    requestedCustomerId: null,
  });
}

test("legacy confirmed status can start visit registration", async () => {
  const result = await execute(" ＣＯＮＦＩＲＭＥＤ ");

  assert.equal(result.ok, true);
  assert.equal(result.data.reservation.id, RESERVATION_ID);
  assert.equal(result.data.reservation.customerId, CUSTOMER_ID);
  assert.equal(result.data.reservation.staffId, STAFF_ID);
  assert.equal(result.data.reservation.visitDate, "2099-10-02");
});

test("unconfirmed reservation still cannot start visit registration", async () => {
  const result = await execute(" requested ");

  assert.equal(result.ok, false);
  assert.equal(result.message, "予約情報を確認できませんでした。");
});
