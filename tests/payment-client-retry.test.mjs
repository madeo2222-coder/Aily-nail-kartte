import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
function nodes(node, type, result = []) {
  if (!node || typeof node !== "object") return result;
  if (node.type === type) result.push(node);
  for (const child of [node.props?.children].flat(Infinity)) nodes(child, type, result);
  return result;
}
function mount(kind, reply) {
  const state = []; const calls = []; let cursor = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
    useMemo(fn) { return fn(); },
  };
  const exports = {};
  const source = readFileSync(new URL(`../app/${kind}/[id]/PaymentPageClient.tsx`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Error, Intl, fetch: async url => {
      calls.push(url);
      if (url.includes("4gtoken")) return new Response(JSON.stringify({ token: "fixture-token" }));
      return reply();
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "@/lib/veritrans/payment-result") return { PAYMENT_REVIEW_MESSAGE: "決済結果を確認中です。再度お支払いせず、店舗へお問い合わせください。" };
      return require(name);
    },
  });
  const props = { orderId: "fixture-order", requestId: "fixture-request", paymentLinkKey: "fixture-key", customerName: "Fixture", productName: "Fixture nail", amount: 13300, paymentDueAt: "2099-01-01T00:00:00Z", tokenApiKey: "fixture-key" };
  function render() { cursor = 0; return exports.default(props); }
  let tree = render();
  nodes(tree, "input").forEach((input, i) => input.props.onChange({ target: { value: ["4111111111111111", "1299", "123", "TEST USER"][i] } }));
  tree = render();
  return {
    calls, refresh() { tree = render(); },
    submit() { const handler = nodes(tree, "form")[0]?.props.onSubmit; assert.ok(handler); return handler({ preventDefault() {} }); },
    button() { return nodes(tree, "button").find(n => n.props.type === "submit"); },
    html() { return renderToStaticMarkup(tree); },
    chargeCount() { return calls.filter(url => !url.includes("4gtoken")).length; },
  };
}
for (const kind of ["nail-tip-order-pay", "inbound-nail-tip-pay"]) {
  for (const [name, reply] of [
    ["network loss after POST", () => { throw new Error("connection reset"); }],
    ["pending response", () => new Response(JSON.stringify({ ok: false, paymentStatus: "pending" }), { status: 409 })],
    ["invalid gateway response", () => new Response("Bad gateway", { status: 502 })],
  ]) test(`${kind}: ${name} blocks retries and does not show success`, async () => {
    const app = mount(kind, reply);
    await Promise.all([app.submit(), app.submit()]);
    app.refresh();
    assert.equal(app.chargeCount(), 1);
    assert.equal(app.button().props.disabled, true);
    assert.match(app.html(), /決済結果を確認中/);
    assert.doesNotMatch(app.html(), /お支払いが完了しました/);
    await app.submit(); assert.equal(app.chargeCount(), 1);
  });
  test(`${kind}: explicit decline allows correction and retry`, async () => {
    const app = mount(kind, () => new Response(JSON.stringify({ ok: false, paymentStatus: "failed", error: "declined" }), { status: 402 }));
    await app.submit(); app.refresh(); assert.equal(app.button().props.disabled, false);
    await app.submit(); assert.equal(app.chargeCount(), 2);
  });
  test(`${kind}: successful double submit posts once`, async () => {
    const app = mount(kind, () => new Response(JSON.stringify({ ok: true })));
    await Promise.all([app.submit(), app.submit()]); app.refresh();
    assert.equal(app.chargeCount(), 1); assert.match(app.html(), /お支払いが完了しました/);
  });
}
