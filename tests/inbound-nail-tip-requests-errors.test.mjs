import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/inbound-nail-tip-requests/page.tsx", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
).outputText;

async function renderPage({ mode = "success", view } = {}) {
  const queries = [];
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    Date,
    Error,
    Intl,
    Number,
    Promise,
    console: { error() {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "dummy",
      },
    },
    require(name) {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { __esModule: true, default: "a" };
      if (name === "next/image") return { __esModule: true, default: "img" };
      if (name.startsWith("./")) {
        return { __esModule: true, default: () => null };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            return {
              from(table) {
                const query = { table };
                queries.push(query);
                const chain = {
                  select(columns) {
                    query.columns = columns;
                    return chain;
                  },
                  order(column, options) {
                    query.order = [column, options];
                    return chain;
                  },
                  then(resolve, reject) {
                    return Promise.resolve()
                      .then(() => {
                        if (mode === "rejection") throw new Error("offline");
                        if (mode === "query-error") {
                          return { data: null, error: { message: "read failed" } };
                        }
                        if (mode === "empty") return { data: [], error: null };
                        return {
                          data: [
                            {
                              id: "request-1",
                              customer_name: "海外顧客",
                              customer_email: "guest@example.com",
                              country: "US",
                              language: "en",
                              order_type: "anime_character",
                              design_request: "Blue design",
                              image_urls: [],
                              status: "new",
                              quote_amount: null,
                              payment_url: null,
                              payment_status: "unpaid",
                              shipping_company: null,
                              tracking_number: null,
                              shipped_at: null,
                              created_at: "2026-09-29T00:00:00Z",
                              instagram_id: null,
                              recipient_name: null,
                              shipping_address: null,
                              shipping_city: null,
                              shipping_state: null,
                              shipping_postal_code: null,
                              shipping_phone: null,
                            },
                          ],
                          error: null,
                        };
                      })
                      .then(resolve, reject);
                  },
                };
                return chain;
              },
            };
          },
        };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  const tree = await exports.default({
    searchParams: Promise.resolve(view ? { view } : {}),
  });
  return {
    html: renderToStaticMarkup(tree),
    queries: JSON.parse(JSON.stringify(queries)),
  };
}

for (const mode of ["query-error", "rejection"]) {
  test(`inbound nail-tip requests hide incomplete work after ${mode}`, async () => {
    const page = await renderPage({ mode, view: "completed" });

    assert.match(page.html, /role="alert"/);
    assert.match(page.html, /件数と相談内容は表示していません/);
    assert.match(page.html, /href="\/inbound-nail-tip-requests\?view=completed"/);
    assert.doesNotMatch(
      page.html,
      /進行中<|完了<|総数<|まだ相談はありません|海外顧客|見積金額|支払状況/
    );
  });
}

test("inbound nail-tip requests preserve an authoritative empty result", async () => {
  const page = await renderPage({ mode: "empty" });

  assert.doesNotMatch(page.html, /role="alert"/);
  assert.match(page.html, /進行中/);
  assert.match(page.html, /総数/);
  assert.match(page.html, /まだ相談はありません/);
});

test("inbound nail-tip requests render complete successful data", async () => {
  const page = await renderPage();

  assert.doesNotMatch(page.html, /role="alert"|まだ相談はありません/);
  assert.match(page.html, /海外顧客/);
  assert.match(page.html, /Blue design/);
  assert.deepEqual(page.queries, [
    {
      table: "inbound_nail_tip_requests",
      columns: "*",
      order: ["created_at", { ascending: false }],
    },
  ]);
});
