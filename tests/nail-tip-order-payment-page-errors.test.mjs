import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/nail-tip-order-pay/[id]/page.tsx", import.meta.url),
    "utf8"
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
).outputText;

const paymentLinkKey = "a".repeat(43);
const paymentLinkTokenHash = createHash("sha256")
  .update(paymentLinkKey, "utf8")
  .digest("hex");
const order = {
  id: "order-1",
  customer_id: "customer-1",
  product_name_snapshot: "テストチップ",
  product_price: 5000,
  payment_status: "payment_waiting",
  payment_due_at: "2099-09-28T00:00:00Z",
  payment_link_token_hash: paymentLinkTokenHash,
};

async function renderPage({
  orderResult = { data: order, error: null },
  customerResult = { data: { name: "山田 花子" }, error: null },
  rejectTable = "",
} = {}) {
  const queries = [];
  const results = {
    nail_tip_orders: orderResult,
    customers: customerResult,
  };
  const supabase = {
    from(table) {
      queries.push(table);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() {
          return rejectTable === table
            ? Promise.reject(new Error("offline"))
            : Promise.resolve(results[table]);
        },
      };
      return chain;
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Buffer,
    Date,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
        VERITRANS_DUMMY: "1",
      },
    },
    require(name) {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "crypto") return require(name);
      if (name === "@supabase/supabase-js") {
        return { createClient: () => supabase };
      }
      if (name === "next/navigation") {
        return { notFound: () => { throw new Error("NEXT_NOT_FOUND"); } };
      }
      if (name === "@/lib/veritrans/config") {
        return { getVeriTransTokenApiKey: () => "dummy-token-key" };
      }
      if (name === "./PaymentPageClient") {
        return {
          __esModule: true,
          default: props => React.createElement(
            "div",
            { "data-customer-name": props.customerName },
            "決済画面"
          ),
        };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  const tree = await exports.default({
    params: Promise.resolve({ id: "order-1" }),
    searchParams: Promise.resolve({ key: paymentLinkKey }),
  });
  return { html: renderToStaticMarkup(tree), queries };
}

test("payment page shows a safe temporary error after an order query error", async () => {
  for (const options of [
    { orderResult: { data: null, error: { message: "read failed" } } },
    { rejectTable: "nail_tip_orders" },
  ]) {
    const page = await renderPage(options);
    assert.match(page.html, /お支払い情報を読み込めません/);
    assert.match(page.html, /一時的な通信エラー/);
    assert.doesNotMatch(page.html, /決済画面/);
  }
});

test("payment page still hides a genuinely missing or tokenless order", async () => {
  await assert.rejects(
    renderPage({ orderResult: { data: null, error: null } }),
    /NEXT_NOT_FOUND/
  );
  await assert.rejects(
    renderPage({
      orderResult: {
        data: { ...order, payment_link_token_hash: null },
        error: null,
      },
    }),
    /NEXT_NOT_FOUND/
  );
});

test("payment page does not continue with a generic customer after customer lookup failure", async () => {
  for (const options of [
    { customerResult: { data: null, error: { message: "read failed" } } },
    { rejectTable: "customers" },
  ]) {
    const page = await renderPage(options);
    assert.match(page.html, /お支払い情報を読み込めません/);
    assert.doesNotMatch(page.html, /data-customer-name="お客様"|決済画面/);
  }
});

test("payment page preserves a legitimate missing customer name fallback", async () => {
  const page = await renderPage({
    customerResult: { data: null, error: null },
  });
  assert.match(page.html, /data-customer-name="お客様"/);
  assert.deepEqual(page.queries, ["nail_tip_orders", "customers"]);
});

test("payment page renders a successfully loaded customer name", async () => {
  const page = await renderPage();
  assert.match(page.html, /data-customer-name="山田 花子"/);
  assert.doesNotMatch(page.html, /お支払い情報を読み込めません/);
});
