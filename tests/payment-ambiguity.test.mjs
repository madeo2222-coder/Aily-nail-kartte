import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const requestId = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";
const amount = 13300;
function load(path, overrides = {}, env = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports, Buffer, console: { error() {} }, process: { env },
    require(name) { return overrides[name] ?? require(name); },
  });
  return exports;
}
const safety = load("lib/veritrans/payment-result.ts");
function setup(kind, { result = {}, throws = false, completeThrows = false, recordFails = false, dummy = "1" } = {}) {
  const calls = []; const charges = []; let state = null;
  const supabase = {
    from() { return { select() { return { eq() { return { async maybeSingle() {
      return { data: { id: requestId, quote_amount: amount, payment_status: "payment_waiting", status: "quoted" }, error: null };
    } }; } }; } }; },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name.startsWith("create_")) {
        if (["processing", "pending", "paid"].includes(state)) return { error: { code: "P0001", message: "active payment" } };
        state = "processing";
        return { data: kind === "order" ? [{ payment_id: paymentId, amount }] : paymentId, error: null };
      }
      if (name.startsWith("complete_")) {
        if (completeThrows) throw new Error("DB connection lost after authorization");
        state = "paid"; return { data: requestId, error: null };
      }
      if (name.startsWith("record_")) {
        if (recordFails) return { error: { code: "08006" } };
        state = args.p_status; return { data: requestId, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const execute = async (params) => {
    charges.push(params);
    if (throws) throw new Error("gateway response timeout");
    return { mstatus: "success", pending: "0", orderId: params.orderId, vResultCode: "A001000000000000", merrMsg: null, ...result };
  };
  const override = {
    "@supabase/supabase-js": { createClient: () => supabase },
    "@/lib/veritrans/config": { getVeriTransConfig: () => ({ merchantCcid: "fixture", merchantSecret: "fixture", tokenApiKey: "fixture", dummy: "1", appUrl: "https://example.test" }) },
    "@/lib/veritrans/payment-result": safety,
    "@/lib/veritrans/card-authorize": { executeCardAuthorize: async params => {
      const r = await execute(params);
      return { ...r, responseOrderId: r.orderId, succeeded: r.mstatus === "success" && r.pending === "0" && r.orderId === params.orderId && r.vResultCode === "A001000000000000" };
    } },
    winston: { createLogger: () => ({}) },
    "tg-mdk-node/dist/tgMdk/Transaction.js": { Transaction: class { execute = execute; } },
    "tg-mdk-node/dist/tgMdk/MerchantConfig.js": { MerchantConfig: class {} },
    "tg-mdk-node/dist/tgMdkDto/Card/CardAuthorizeRequestDto.js": { CardAuthorizeRequestDto: class {} },
    "tg-mdk-node/dist/tgMdkDto/Card/CardAuthorizeResponseDto.js": { CardAuthorizeResponseDto: class {} },
  };
  const path = kind === "order" ? "nail-tip-orders" : "inbound-nail-tip-requests";
  const route = load(`app/api/${path}/[id]/pay/route.ts`, override, {
    VERITRANS_DUMMY: dummy, NEXT_PUBLIC_SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
  });
  return { calls, charges, state: () => state, async pay() {
    return route.POST(new Request("https://example.test/pay", { method: "POST", body: JSON.stringify({ token: "fixture-token", paymentLinkKey: "a".repeat(43), amount: 1 }) }), { params: Promise.resolve({ id: requestId }) });
  } };
}
for (const kind of ["order", "inbound"]) {
  for (const [name, options] of [
    ["transport timeout", { throws: true }],
    ["MDK communication failure", { result: { mstatus: "failure", vResultCode: "MF03000000000000" } }],
    ["missing pending flag", { result: { pending: null } }],
    ["provider order mismatch", { result: { orderId: "another-order" } }],
    ["unrecognized success code", { result: { vResultCode: "A001X00100000000" } }],
    ["unknown failure", { result: { mstatus: "failure", vResultCode: "ZZ99000000000000" } }],
    ["completion DB exception", { completeThrows: true }],
  ]) {
    test(`${kind}: ${name} holds payment pending and blocks a second charge`, async () => {
      const flow = setup(kind, options);
      const first = await flow.pay();
      assert.notEqual(first.status, 200);
      assert.equal((await first.json()).paymentStatus, "pending");
      assert.equal(flow.state(), "pending");
      const second = await flow.pay();
      assert.equal(second.status, 409);
      assert.equal(flow.charges.length, 1);
      assert.equal(Number(flow.charges[0].amount), amount);
    });
  }
  test(`${kind}: failure to persist unknown result retains the processing lock`, async () => {
    const flow = setup(kind, { throws: true, recordFails: true });
    assert.equal((await flow.pay()).status, 500);
    assert.equal(flow.state(), "processing");
    assert.equal((await flow.pay()).status, 409);
    assert.equal(flow.charges.length, 1);
  });
  test(`${kind}: confirmed decline permits retry, never returns provider diagnostics`, async () => {
    const flow = setup(kind, { result: { mstatus: "failure", vResultCode: "AG33000000000000", merrMsg: "private provider details" } });
    const response = await flow.pay();
    assert.equal(response.status, 402);
    assert.equal(flow.state(), "failed");
    assert.equal((await response.json()).paymentStatus, "failed");
    await flow.pay();
    assert.equal(flow.charges.length, 2);
  });
  test(`${kind}: success is applied once and browser amount is ignored`, async () => {
    const flow = setup(kind);
    const responses = await Promise.all([flow.pay(), flow.pay()]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    assert.equal(flow.state(), "paid");
    assert.equal(flow.charges.length, 1);
    assert.equal(Number(flow.charges[0].amount), amount);
  });
  test(`${kind}: live payment remains disabled without touching DB or gateway`, async () => {
    const flow = setup(kind, { dummy: "0" });
    assert.equal((await flow.pay()).status, 503);
    assert.equal(flow.charges.length, 0);
    assert.equal(flow.calls.length, 0);
  });
}
