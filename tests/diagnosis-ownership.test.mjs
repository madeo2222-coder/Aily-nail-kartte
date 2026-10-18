import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server.js";
const compiled = ts.transpileModule(readFileSync(new URL("../app/api/sanmeigaku-diagnoses/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load({ customer = { id: "owner-customer", salonId: "owner-salon" }, fail = false } = {}) {
  const writes = []; const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === "next/server") return { NextResponse };
    if (name === "@/lib/server/requireCustomerLineSession") return {
      requireCustomerLineSession: async () => customer,
      getSupabaseAdmin: () => ({ from(table) { return { insert(row) {
        writes.push({ table, row }); return { select() { return { async single() {
          return fail ? { error: { message: "private database diagnostics" } } : { data: { id: "saved-diagnosis" }, error: null };
        } }; } };
      } }; } }),
    };
    throw new Error(`unexpected module ${name}`);
  } });
  return { writes, submit(body) { return exports.POST(new Request("https://example.test/diagnosis", { method: "POST", body: JSON.stringify(body) })); }, route: exports };
}
const valid = { name: "Test customer", birthday: "1990-02-28", fortune: "仕事", mood: "落ち着く", diagnosisType: "free_nail" };
test("unauthenticated history writes are rejected before reading the request", async () => {
  const app = load({ customer: null });
  const response = await app.route.POST({ json() { throw new Error("body must not be read"); } });
  assert.equal(response.status, 401); assert.equal(app.writes.length, 0);
});
test("forged customer and salon identifiers cannot redirect diagnosis ownership", async () => {
  const app = load();
  const response = await app.submit({ ...valid, customerId: "someone-else", salonId: "other-salon" });
  assert.equal(response.status, 200);
  assert.equal(app.writes[0].row.customer_id, "owner-customer");
  assert.equal(app.writes[0].row.salon_id, "owner-salon");
  assert.equal((await response.json()).diagnosisId, "saved-diagnosis");
});
test("invalid dates, future birthdays and malformed or unbounded input never write", async () => {
  for (const body of [null, [], { ...valid, name: "" }, { ...valid, birthday: "2026-02-30" }, { ...valid, birthday: "2999-01-01" }, { ...valid, mood: {} }, { ...valid, message: "x".repeat(4001) }, { ...valid, diagnosisType: "paid_diagnosis" }]) {
    const app = load(); assert.equal((await app.submit(body)).status, 400); assert.equal(app.writes.length, 0);
  }
});
test("database errors return neither success nor internal diagnostics", async () => {
  const app = load({ fail: true }); const response = await app.submit(valid);
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private database|saved-diagnosis/);
});
