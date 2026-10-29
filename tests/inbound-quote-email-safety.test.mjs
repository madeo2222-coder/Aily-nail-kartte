import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(
  new URL(
    "../app/api/inbound-nail-tip-requests/[id]/send-quote/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const routeCompiled = ts.transpileModule(routeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const formSource = readFileSync(
  new URL("../app/inbound-nail-tip-requests/PaymentUrlForm.tsx", import.meta.url),
  "utf8",
);
const formCompiled = ts.transpileModule(formSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const pageSource = readFileSync(
  new URL("../app/inbound-nail-tip-requests/page.tsx", import.meta.url),
  "utf8",
);

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
  }

  async json() {
    return this.body;
  }
}

function loadRoute({
  requestRow = {
    id: "request-1",
    customer_name: "Fixture Guest",
    customer_email: "guest@example.test",
    quote_amount: 18000,
    payment_url: "https://fixture.example/inbound-nail-tip-pay/request-1",
  },
  emailOk = true,
  updateError = null,
} = {}) {
  const emailCalls = [];
  const updates = [];

  const supabase = {
    from(table) {
      assert.equal(table, "inbound_nail_tip_requests");
      let operation = "read";

      return {
        select() {
          return this;
        },
        update(payload) {
          operation = "update";
          updates.push(payload);
          return this;
        },
        eq(column, value) {
          assert.equal(column, "id");
          assert.equal(value, requestRow.id);
          if (operation === "update") {
            return Promise.resolve({ error: updateError });
          }
          return this;
        },
        async single() {
          return { data: requestRow, error: null };
        },
      };
    },
  };
  const exports = {};

  vm.runInNewContext(routeCompiled, {
    exports,
    console,
    fetch: async (url, options) => {
      emailCalls.push({ url, options });
      return {
        ok: emailOk,
        async text() {
          return emailOk ? "" : "fixture resend failure";
        },
      };
    },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
        RESEND_API_KEY: "re_fixture",
        RESEND_FROM_EMAIL: "Aily <noreply@example.test>",
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
      if (name === "@supabase/supabase-js") {
        return { createClient: () => supabase };
      }
      if (name === "@/lib/server/staffApiAuthentication") {
        return {
          authenticateStaffApi: async () => ({
            ok: true,
            principal: {
              authenticationMode: "supabase",
              staffId: "owner-1",
              salonId: "salon-1",
              role: "owner",
            },
          }),
        };
      }
      return require(name);
    },
  });

  async function post() {
    const response = await exports.POST(
      {},
      { params: Promise.resolve({ id: requestRow.id }) },
    );
    return { body: await response.json(), status: response.status };
  }

  return { emailCalls, post, updates };
}

function findNodes(node, type) {
  if (!node || typeof node !== "object") return [];
  return [
    ...(node.type === type ? [node] : []),
    ...[node.props?.children]
      .flat(Infinity)
      .flatMap((child) => findNodes(child, type)),
  ];
}

function response({ ok = true, body = { ok: true } } = {}) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

function mountForm() {
  const states = [];
  let cursor = 0;
  const requests = [];
  const alerts = [];
  let reloads = 0;
  const exports = {};

  vm.runInNewContext(formCompiled, {
    exports,
    alert: (message) => alerts.push(String(message)),
    confirm: () => true,
    console: { error() {} },
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        requests.push({ options, reject, resolve, url });
      });
    },
    navigator: { clipboard: { writeText: async () => {} } },
    window: { location: { reload: () => (reloads += 1) } },
    require(name) {
      if (name === "react") {
        return {
          useRef(initial) {
            const index = cursor++;
            return (states[index] ??= { current: initial });
          },
          useState(initial) {
            const index = cursor++;
            if (!(index in states)) states[index] = initial;
            return [states[index], (value) => (states[index] = value)];
          },
        };
      }
      if (name === "react/jsx-runtime") return require(name);
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function render() {
    cursor = 0;
    return exports.default({ requestId: "request-1", defaultUrl: null });
  }

  function actionButton() {
    return findNodes(render(), "button").at(-1);
  }

  return {
    actionButton,
    alerts,
    get reloads() {
      return reloads;
    },
    requests,
  };
}

async function waitForRequestCount(page, count) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (page.requests.length >= count) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`Expected ${count} requests, received ${page.requests.length}`);
}

test("quote email retries reuse one Resend idempotency key", async () => {
  const runtime = loadRoute();

  assert.equal((await runtime.post()).status, 200);
  assert.equal((await runtime.post()).status, 200);
  assert.equal(runtime.emailCalls.length, 2);
  assert.equal(
    runtime.emailCalls[0].options.headers["Idempotency-Key"],
    runtime.emailCalls[1].options.headers["Idempotency-Key"],
  );
  assert.match(
    runtime.emailCalls[0].options.headers["Idempotency-Key"],
    /^inbound-quote\/request-1\/[a-f0-9]{32}$/,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.updates)), [
    { status: "payment_waiting", payment_status: "unpaid" },
    { status: "payment_waiting", payment_status: "unpaid" },
  ]);
});

test("quote changes produce a different Resend idempotency key", async () => {
  const first = loadRoute();
  const second = loadRoute({
    requestRow: {
      id: "request-1",
      customer_name: "Fixture Guest",
      customer_email: "guest@example.test",
      quote_amount: 19000,
      payment_url: "https://fixture.example/inbound-nail-tip-pay/request-1",
    },
  });

  await first.post();
  await second.post();
  assert.notEqual(
    first.emailCalls[0].options.headers["Idempotency-Key"],
    second.emailCalls[0].options.headers["Idempotency-Key"],
  );
});

test("email acceptance with a failed status update is reported without suggesting resend", async () => {
  const runtime = loadRoute({ updateError: { message: "fixture update failure" } });
  const result = await runtime.post();

  assert.equal(result.status, 500);
  assert.equal(result.body.emailAccepted, true);
  assert.equal(result.body.idempotencyProtected, true);
  assert.match(result.body.error, /再送せず/);
  assert.equal(runtime.emailCalls.length, 1);
});

test("quote workflow blocks double clicks before React rerenders", async () => {
  const page = mountForm();
  const button = page.actionButton();
  const pending = button.props.onClick();
  void button.props.onClick();

  assert.equal(page.requests.length, 1);
  assert.match(page.requests[0].url, /\/payment-url$/);
  assert.equal(page.actionButton().props.disabled, true);

  page.requests[0].resolve(
    response({
      body: {
        ok: true,
        paymentUrl: "https://fixture.example/inbound-nail-tip-pay/request-1",
      },
    }),
  );
  await waitForRequestCount(page, 2);
  assert.match(page.requests[1].url, /\/send-quote$/);
  page.requests[1].resolve(response());
  await pending;
  assert.equal(page.reloads, 1);
});

for (const failure of ["network", "success-json"]) {
  test(`quote workflow locks resending after ambiguous ${failure} result`, async () => {
    const page = mountForm();
    const pending = page.actionButton().props.onClick();
    page.requests[0].resolve(
      response({
        body: {
          ok: true,
          paymentUrl: "https://fixture.example/inbound-nail-tip-pay/request-1",
        },
      }),
    );
    await waitForRequestCount(page, 2);

    if (failure === "network") {
      page.requests[1].reject(new Error("response lost"));
    } else {
      page.requests[1].resolve({
        ok: true,
        async json() {
          throw new Error("response body lost");
        },
      });
    }

    await pending;
    assert.equal(page.actionButton().props.disabled, true);
    assert.equal(page.actionButton().props.children, "送信結果を確認してください");
    assert.match(page.alerts.at(-1), /重複送信を防ぐため再送を停止/);
    await page.actionButton().props.onClick();
    assert.equal(page.requests.length, 2);
  });
}

test("explicit pre-send email failure stays retryable", async () => {
  const page = mountForm();
  const pending = page.actionButton().props.onClick();
  page.requests[0].resolve(
    response({
      body: {
        ok: true,
        paymentUrl: "https://fixture.example/inbound-nail-tip-pay/request-1",
      },
    }),
  );
  await waitForRequestCount(page, 2);
  page.requests[1].resolve(
    response({ ok: false, body: { ok: false, error: "Resend rejected" } }),
  );
  await pending;

  assert.equal(page.actionButton().props.disabled, false);
  const retry = page.actionButton().props.onClick();
  assert.equal(page.requests.length, 3);
  page.requests[2].resolve(
    response({
      body: {
        ok: true,
        paymentUrl: "https://fixture.example/inbound-nail-tip-pay/request-1",
      },
    }),
  );
  await waitForRequestCount(page, 4);
  page.requests[3].resolve(response());
  await retry;
});

test("new requests no longer show the unusable direct send button", () => {
  assert.doesNotMatch(pageSource, /SendQuoteButton/);
});
