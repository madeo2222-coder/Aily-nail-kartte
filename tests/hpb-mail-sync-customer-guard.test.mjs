import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadSync(manualCustomerId) {
  const writes = [];
  const customer = { id: "mail-customer", name: "テスト顧客", phone: "09000000000" };
  const manual = {
    id: "manual-reservation", customer_id: manualCustomerId,
    staff_id: null, menu: "HPB予約", memo: "電話で先に登録", status: "confirmed",
  };
  const db = {
    from(table) {
      let operation = "read";
      let externalLookup = false;
      let payload;
      const query = {
        select() { return query; },
        eq() { return query; },
        not() { return query; },
        gte() { return query; },
        lte() { return query; },
        limit() { return query; },
        ilike() { externalLookup = true; return query; },
        update(value) { operation = "update"; payload = value; return query; },
        upsert(value) { operation = "upsert"; payload = value; return query; },
        single() { return query; },
        then(resolve, reject) {
          if (operation !== "read") {
            writes.push({ table, operation, payload });
            return Promise.resolve({ data: payload, error: null }).then(resolve, reject);
          }
          const data = table === "salons" ? [{ id: "salon-1" }]
            : table === "customers" ? [customer]
              : table === "reservations" ? (externalLookup ? [] : [manual])
                : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  function load(path) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, {
      exports,
      process: { env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
      } },
      require(name) {
        if (name === "server-only") return {};
        if (name === "@supabase/supabase-js") return { createClient: () => db };
        if (name.startsWith("@/lib/")) return load(`../${name.slice(2)}.ts`);
        return require(name);
      },
    });
    return exports;
  }
  return { sync: load("../lib/hpb-mail-sync.ts").syncHpbMailText, writes };
}

const mail = `予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
指名スタッフ：指名なし
所要時間目安：90分`;

test("delayed mail refuses to reassign another customer's source-marked reservation", async () => {
  const runtime = loadSync("different-customer");
  await assert.rejects(runtime.sync(mail), /顧客.*一致.*同期を停止/);
  assert.equal(runtime.writes.length, 0);
});

for (const customerId of ["mail-customer", null]) {
  test(`delayed mail preserves reconciliation for ${customerId ?? "unassigned customer"}`, async () => {
    const runtime = loadSync(customerId);
    const result = await runtime.sync(mail);
    assert.equal(result.result.reservationId, "manual-reservation");
    assert.equal(result.result.reconciledManualEntry, true);
    assert.equal(runtime.writes.length, 1);
    assert.equal(runtime.writes[0].operation, "update");
    assert.equal(runtime.writes[0].payload.customer_id, "mail-customer");
    assert.match(runtime.writes[0].payload.memo, /電話で先に登録/);
  });
}
