import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const pageSource = readFileSync(
  new URL("../app/customer-app/inbound/page.tsx", import.meta.url),
  "utf8",
);
const compiledPage = ts.transpileModule(pageSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

const translations = (() => {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(
      new URL("../app/customer-app/inbound/translations.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(source, { exports });
  return exports;
})();

function nodeText(node) {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!node || typeof node !== "object") return "";
  return [node.props?.children].flat(Infinity).map(nodeText).join("");
}

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return null;
}

function response({ ok = true, body = { ok: true } } = {}) {
  return { ok, async json() { return body; } };
}

function mount({ mode = "success", flow = "reservation" } = {}) {
  const states = [];
  let cursor = 0;
  const requests = [];

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) {
        states[index] = typeof initial === "function" ? initial() : initial;
      }
      return [states[index], value => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useMemo: fn => fn(),
    useEffect() {},
  };

  async function fetch(url, options = {}) {
    requests.push({ url, options });
    assert.equal(
      url,
      flow === "reservation"
        ? "/api/inbound-reservations"
        : "/api/inbound-nail-tip-requests",
    );

    if (mode === "reject") throw new Error("response lost");
    if (mode === "unknown-json") {
      return {
        ok: true,
        async json() { throw new Error("response body lost"); },
      };
    }
    if (mode === "failure") {
      return response({
        ok: false,
        body: {
          ok: false,
          error:
            flow === "reservation"
              ? "Not enough staff available."
              : "Request details are incomplete.",
        },
      });
    }
    return response({
      body:
        flow === "reservation"
          ? { ok: true, reservationIds: ["r1"] }
          : { ok: true, requestId: "request-1" },
    });
  }

  const exports = {};
  vm.runInNewContext(compiledPage, {
    exports,
    Date,
    Intl,
    Math,
    Number,
    Promise,
    console: { error() {} },
    document: { body: { scrollHeight: 1 } },
    window: {
      location: { origin: "https://example.test" },
      setTimeout() {},
      scrollTo() {},
    },
    fetch,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            auth: {
              async getUser() { return { data: { user: null } }; },
              async signInWithOAuth() { return { error: null }; },
            },
          },
        };
      }
      if (name === "./translations") return translations;
      if (name === "./InboundPortfolioGallery") {
        return { default: () => null };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  }, { filename: "inbound-reservation-page.js" });

  function tree() {
    cursor = 0;
    return exports.default();
  }

  function html() {
    return renderToStaticMarkup(tree());
  }

  function prepareReservation() {
    const serviceButton = findNode(
      tree(),
      node => node.type === "button" && nodeText(node).includes("Salon Reservation in Fukuoka"),
    );
    assert.ok(serviceButton);
    serviceButton.props.onClick();

    const reservationTree = tree();
    findNode(reservationTree, node => node.type === "input" && node.props.type === "date")
      .props.onChange({ target: { value: "2026-11-15" } });
    findNode(
      reservationTree,
      node => node.type === "select" && nodeText(node).includes("10:00"),
    ).props.onChange({ target: { value: "10:00" } });
    findNode(
      reservationTree,
      node => node.type === "input" && node.props.placeholder === "Your name",
    ).props.onChange({ target: { value: "Guest A" } });
    findNode(
      reservationTree,
      node => node.type === "input" && node.props.type === "email",
    ).props.onChange({ target: { value: "guest@example.com" } });
  }

  function prepareNailTipRequest() {
    const requestTree = tree();
    const changeInput = (placeholder, value) => {
      const input = findNode(
        requestTree,
        node => node.type === "input" && node.props.placeholder === placeholder,
      );
      assert.ok(input, `input ${placeholder}`);
      input.props.onChange({ target: { value } });
    };

    changeInput("Your name", "Guest A");
    changeInput("you@example.com", "guest@example.com");
    changeInput("France / USA / Korea / Thailand...", "France");
    changeInput("Full name for delivery", "Guest A");
    changeInput("City", "Paris");
    changeInput("Postal code", "75001");
    changeInput("+1 123 456 7890", "+33 1 23 45 67 89");

    const address = findNode(
      requestTree,
      node =>
        node.type === "textarea" &&
        node.props.placeholder === "Street address, apartment, building",
    );
    assert.ok(address);
    address.props.onChange({ target: { value: "1 Rue de Test" } });

    const design = findNode(
      requestTree,
      node => node.type === "textarea" && node.props.rows === 5,
    );
    assert.ok(design);
    design.props.onChange({ target: { value: "Pink original design" } });
  }

  async function submit() {
    const submitButton = findNode(
      tree(),
      node => node.type === "button" && nodeText(node).includes("Send reservation request"),
    );
    assert.ok(submitButton);
    await submitButton.props.onClick();
  }

  async function submitNailTipRequest() {
    const submitButton = findNode(
      tree(),
      node =>
        node.type === "button" &&
        nodeText(node).includes("Send custom nail tips request"),
    );
    assert.ok(submitButton);
    await submitButton.props.onClick();
  }

  return {
    html,
    prepareNailTipRequest,
    prepareReservation,
    requests,
    submit,
    submitNailTipRequest,
    tree,
  };
}

test("inbound reservation guards before sending and exposes a persistent unknown-result lock", () => {
  assert.match(
    pageSource,
    /if \(reservationSubmissionInFlight\.current \|\| reservationResultUnknown\)/,
  );
  assert.ok(
    pageSource.indexOf("reservationSubmissionInFlight.current = true") <
      pageSource.indexOf('fetch("/api/inbound-reservations"'),
  );
  assert.match(pageSource, /disabled=\{sending \|\| reservationResultUnknown\}/);
});

for (const mode of ["reject", "unknown-json"]) {
  test(`inbound reservation blocks duplicate submission after ${mode}`, async () => {
    const page = mount({ mode });
    page.prepareReservation();
    await page.submit();

    assert.match(page.html(), /We could not confirm the reservation result/);
    assert.match(page.html(), /Do not send the same request again/);
    assert.equal(page.requests.length, 1);

    await page.submit();
    assert.equal(page.requests.length, 1);
  });
}

test("inbound reservation keeps an authoritative API rejection retryable", async () => {
  const page = mount({ mode: "failure" });
  page.prepareReservation();
  await page.submit();

  assert.doesNotMatch(page.html(), /We could not confirm the reservation result/);
  assert.match(page.html(), /Not enough staff available/);

  await page.submit();
  assert.equal(page.requests.length, 2);
});

test("inbound nail-tip request guards before uploading or sending", () => {
  assert.match(
    pageSource,
    /if \(nailTipSubmissionInFlight\.current \|\| nailTipResultUnknown\)/,
  );
  assert.ok(
    pageSource.indexOf("nailTipSubmissionInFlight.current = true") <
      pageSource.indexOf("await uploadDesignImages()"),
  );
  assert.match(pageSource, /disabled=\{sending \|\| nailTipResultUnknown\}/);
});

for (const mode of ["reject", "unknown-json"]) {
  test(`inbound nail-tip request blocks duplicate submission after ${mode}`, async () => {
    const page = mount({ mode, flow: "nail-tip" });
    page.prepareNailTipRequest();
    await page.submitNailTipRequest();

    assert.match(page.html(), /We could not confirm the custom request result/);
    assert.match(page.html(), /Do not send the same request again/);
    assert.equal(page.requests.length, 1);

    await page.submitNailTipRequest();
    assert.equal(page.requests.length, 1);
  });
}

test("inbound nail-tip request keeps an authoritative API rejection retryable", async () => {
  const page = mount({ mode: "failure", flow: "nail-tip" });
  page.prepareNailTipRequest();
  await page.submitNailTipRequest();

  assert.doesNotMatch(page.html(), /We could not confirm the custom request result/);
  assert.match(page.html(), /Request details are incomplete/);

  await page.submitNailTipRequest();
  assert.equal(page.requests.length, 2);
});
