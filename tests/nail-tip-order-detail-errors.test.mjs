import assert from "node:assert/strict";
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
    new URL("../app/nail-tip-orders/[id]/page.tsx", import.meta.url),
    "utf8"
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
).outputText;

const order = {
  id: "order-1",
  customer_id: "customer-1",
  design_request: "選択商品：テストチップ",
  status: "requested",
  created_at: "2026-09-28T00:00:00Z",
  product_price: 5000,
};

async function renderPage({
  orderResult = { data: order, error: null },
  customerResult = {
    data: { id: "customer-1", name: "山田 花子", phone: "09012345678" },
    error: null,
  },
  paymentResult = { data: null, error: null },
  rejectTable = "",
} = {}) {
  const queries = [];
  const results = {
    nail_tip_orders: orderResult,
    customers: customerResult,
    nail_tip_order_payments: paymentResult,
  };

  const supabase = {
    from(table) {
      queries.push(table);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        single() { return finish(); },
        maybeSingle() { return finish(); },
      };
      function finish() {
        return rejectTable === table
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(results[table]);
      }
      return chain;
    },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
      },
    },
    require(name) {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") {
        return { __esModule: true, default: ({ href, children, ...props }) =>
          React.createElement("a", { href, ...props }, children) };
      }
      if (name === "@supabase/supabase-js") {
        return { createClient: () => supabase };
      }
      if (name === "./OrderPaymentForm") {
        return { __esModule: true, default: props => React.createElement(
          "div",
          { "data-payment-load-failed": String(props.paymentHistoryLoadFailed) },
          "決済フォーム"
        ) };
      }
      if (name === "./OrderStatusForm" || name === "./OrderShippingForm") {
        return { __esModule: true, default: () => React.createElement("div") };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  const tree = await exports.default({ params: Promise.resolve({ id: "order-1" }) });
  return { html: renderToStaticMarkup(tree), queries };
}

test("order detail distinguishes a transient order read failure from a missing order", async () => {
  const failed = await renderPage({
    orderResult: { data: null, error: { code: "500", message: "read failed" } },
  });
  assert.match(failed.html, /role="alert"/);
  assert.match(failed.html, /注文情報を取得できませんでした/);
  assert.match(failed.html, /再読み込み/);
  assert.doesNotMatch(failed.html, /注文が見つかりません/);

  const missing = await renderPage({
    orderResult: { data: null, error: { code: "PGRST116", message: "0 rows" } },
  });
  assert.match(missing.html, /注文が見つかりません/);
  assert.doesNotMatch(missing.html, /注文情報を取得できませんでした/);
});

test("order detail hides incomplete customer data after a customer query failure", async () => {
  const page = await renderPage({
    customerResult: { data: null, error: { message: "read failed" } },
  });
  assert.match(page.html, /role="alert"/);
  assert.match(page.html, /注文情報を取得できませんでした/);
  assert.doesNotMatch(page.html, /顧客名未設定|注文ID：order-1|決済フォーム/);
});

test("order detail handles rejected reads without showing a false empty state", async () => {
  for (const rejectTable of ["nail_tip_orders", "customers"]) {
    const page = await renderPage({ rejectTable });
    assert.match(page.html, /注文情報を取得できませんでした/);
    assert.doesNotMatch(page.html, /注文が見つかりません|顧客名未設定/);
  }
});

test("order detail keeps the page visible but disables payment actions when payment history fails", async () => {
  for (const options of [
    { paymentResult: { data: null, error: { message: "read failed" } } },
    { rejectTable: "nail_tip_order_payments" },
  ]) {
    const page = await renderPage(options);
    assert.match(page.html, /注文ID：order-1/);
    assert.match(page.html, /data-payment-load-failed="true"/);
    assert.doesNotMatch(page.html, /注文情報を取得できませんでした/);
  }
});

test("order detail renders successful customer and payment data", async () => {
  const page = await renderPage({
    paymentResult: {
      data: { order_id: "payment-1", status: "pending" },
      error: null,
    },
  });
  assert.match(page.html, /山田 花子/);
  assert.match(page.html, /data-payment-load-failed="false"/);
  assert.deepEqual(page.queries, [
    "nail_tip_orders",
    "customers",
    "nail_tip_order_payments",
  ]);
});
