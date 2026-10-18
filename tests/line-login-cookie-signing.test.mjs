import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/server/lineLoginCookies.ts", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

class MockResponse {
  constructor(body, status = 200, location = null) {
    this.body = body;
    this.status = status;
    this.location = location;
    this.cookies = { set() {} };
  }

  async json() {
    return this.body;
  }
}

function loadCookieModule({ now = 1_800_000_000_000, secret = "test-secret" } = {}) {
  let currentTime = now;

  class MockDate extends Date {
    static now() {
      return currentTime;
    }
  }

  const exports = {};
  const process = { env: { LINE_LOGIN_CHANNEL_SECRET: secret } };

  vm.runInNewContext(compiled, {
    Buffer,
    Date: MockDate,
    Error,
    JSON,
    Math,
    Number,
    Object,
    String,
    exports,
    process,
    require,
  });

  return {
    exports,
    process,
    setNow(value) {
      currentTime = value;
    },
  };
}

function tamper(value) {
  const [payload, signature] = value.split(".");
  const replacement = signature.startsWith("A") ? "B" : "A";
  return `${payload}.${replacement}${signature.slice(1)}`;
}

test("customer LINE session cookies are signed and expire", () => {
  const runtime = loadCookieModule();
  const token = runtime.exports.createCustomerLineSessionCookie(
    {
      customer_id: "customer-1",
      line_user_id: "line-user-1",
    },
    60
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(runtime.exports.readCustomerLineSessionCookie(token))
    ),
    {
      customer_id: "customer-1",
      line_user_id: "line-user-1",
    }
  );
  assert.equal(
    runtime.exports.readCustomerLineSessionCookie(tamper(token)),
    null
  );
  assert.equal(
    runtime.exports.readCustomerLineSessionCookie(
      JSON.stringify({
        customer_id: "customer-1",
        line_user_id: "line-user-1",
      })
    ),
    null
  );

  runtime.setNow(1_800_000_061_000);
  assert.equal(runtime.exports.readCustomerLineSessionCookie(token), null);
});

test("LINE login state and pending-link cookies require the same signature", () => {
  const runtime = loadCookieModule();
  const state = runtime.exports.createLineStateCookie(
    { state: "state-1", next: "/customer-app" },
    600
  );
  const pending = runtime.exports.createLinePendingCookie(
    {
      line_user_id: "line-user-1",
      display_name: "顧客",
      next: "/customer-app",
    },
    600
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.exports.readLineStateCookie(state))),
    { state: "state-1", next: "/customer-app" }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.exports.readLinePendingCookie(pending))),
    {
      line_user_id: "line-user-1",
      display_name: "顧客",
      next: "/customer-app",
    }
  );
  assert.equal(runtime.exports.readLineStateCookie(tamper(state)), null);
  assert.equal(runtime.exports.readLinePendingCookie(tamper(pending)), null);

  runtime.process.env.LINE_LOGIN_CHANNEL_SECRET = "different-secret";
  assert.equal(runtime.exports.readLineStateCookie(state), null);
  assert.equal(runtime.exports.readLinePendingCookie(pending), null);
});

test("cookie signing fails closed when the configured secret is missing", () => {
  const runtime = loadCookieModule({ secret: "" });

  assert.throws(
    () =>
      runtime.exports.createCustomerLineSessionCookie(
        { customer_id: "customer-1", line_user_id: "line-user-1" },
        60
      ),
    /signing secret is missing/
  );
});

test("every privileged LINE customer route uses the signed-cookie reader", () => {
  const routePaths = [
    "app/api/line-login/me/route.ts",
    "app/api/line-login/customer-history/route.ts",
    "app/api/line-login/gallery-reference/[visitId]/route.ts",
    "app/api/customer-reservations/[id]/route.ts",
    "lib/server/requireCustomerLineSession.ts",
  ];

  for (const routePath of routePaths) {
    const routeSource = readFileSync(
      new URL(`../${routePath}`, import.meta.url),
      "utf8"
    );

    assert.match(routeSource, /readCustomerLineSessionCookie/);
    assert.doesNotMatch(routeSource, /JSON\.parse\(value\)/);
  }
});

test("LINE callback and account linking issue only signed cookies", () => {
  const sessionRoute = readFileSync(
    new URL("../app/api/line-login/session/route.ts", import.meta.url),
    "utf8"
  );
  const linkRoute = readFileSync(
    new URL("../app/api/line-login/link/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(sessionRoute, /createLineStateCookie/);
  assert.match(sessionRoute, /readLineStateCookie/);
  assert.match(sessionRoute, /createLinePendingCookie/);
  assert.match(sessionRoute, /createCustomerLineSessionCookie/);
  assert.match(linkRoute, /readLinePendingCookie/);
  assert.match(linkRoute, /createCustomerLineSessionCookie/);
  assert.doesNotMatch(linkRoute, /safeDecodeJson/);
});

test("a forged pending-link cookie is rejected before body or service-role access", async () => {
  const cookieRuntime = loadCookieModule();
  const routeSource = readFileSync(
    new URL("../app/api/line-login/link/route.ts", import.meta.url),
    "utf8"
  );
  const routeCompiled = ts.transpileModule(routeSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  let bodyRead = false;
  let clientCreated = false;
  const exports = {};

  vm.runInNewContext(routeCompiled, {
    Array,
    Boolean,
    Error,
    JSON,
    Promise,
    Set,
    String,
    exports,
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
        return {
          createClient() {
            clientCreated = true;
            throw new Error("service role must not be created");
          },
        };
      }
      if (name === "@/lib/server/lineLoginCookies") {
        return cookieRuntime.exports;
      }
      return require(name);
    },
  });

  const response = await exports.POST({
    cookies: {
      get() {
        return {
          value: JSON.stringify({
            line_user_id: "attacker-line-id",
            next: "/customer-app",
          }),
        };
      },
    },
    async json() {
      bodyRead = true;
      throw new Error("body must not be read");
    },
  });

  assert.equal(response.status, 400);
  assert.equal(bodyRead, false);
  assert.equal(clientCreated, false);
});

test("the LINE callback rejects a missing or forged state cookie before token exchange", async () => {
  const cookieRuntime = loadCookieModule();
  const routeSource = readFileSync(
    new URL("../app/api/line-login/session/route.ts", import.meta.url),
    "utf8"
  );
  const routeCompiled = ts.transpileModule(routeSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  let externalFetchCalled = false;
  const exports = {};
  const state = Buffer.from(
    JSON.stringify({ token: "state-1", next: "/customer-app" }),
    "utf8"
  ).toString("base64url");

  vm.runInNewContext(routeCompiled, {
    Buffer,
    Boolean,
    Error,
    JSON,
    Promise,
    String,
    URL,
    URLSearchParams,
    encodeURIComponent,
    exports,
    fetch: async () => {
      externalFetchCalled = true;
      throw new Error("LINE token exchange must not run");
    },
    process: {
      env: {
        LINE_LOGIN_CHANNEL_ID: "channel-id",
        LINE_LOGIN_CHANNEL_SECRET: "test-secret",
      },
    },
    require(name) {
      if (name === "next/server") {
        return {
          NextResponse: {
            redirect(url) {
              return new MockResponse(null, 307, String(url));
            },
          },
        };
      }
      if (name === "@supabase/supabase-js") {
        return {
          createClient() {
            throw new Error("service role must not be created");
          },
        };
      }
      if (name === "@/lib/server/lineLoginCookies") {
        return cookieRuntime.exports;
      }
      return require(name);
    },
  });

  const response = await exports.GET({
    url: `https://example.com/api/line-login/session?code=code-1&state=${state}`,
    cookies: {
      get() {
        return {
          value: JSON.stringify({
            state: "state-1",
            next: "/customer-app",
          }),
        };
      },
    },
  });

  assert.equal(response.status, 307);
  assert.match(decodeURIComponent(response.location), /LINEログイン状態/);
  assert.equal(externalFetchCalled, false);
});
