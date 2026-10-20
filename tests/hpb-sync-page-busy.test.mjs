import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../app/hpb-mail-sync-test/page.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function nodes(node, type) {
  if (!node || typeof node !== "object") return [];
  return [...(node.type === type ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => nodes(child, type))];
}

function mount() {
  const states = [];
  let cursor = 0;
  const requests = [];
  const alerts = [];
  let confirm = true;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console: { error() {} }, alert: text => alerts.push(text), window: { confirm: () => confirm },
    fetch(url) { return new Promise((resolve, reject) => requests.push({ url, resolve, reject })); },
    require(name) {
      if (name === "react") return {
        useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
        useRef(initial) { const i = cursor++; return states[i] ??= { current: initial }; },
        useMemo(fn) { return fn(); },
      };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function render() { cursor = 0; return exports.default(); }
  return {
    requests, alerts,
    buttons: () => nodes(render(), "button"),
    input(text) { nodes(render(), "textarea")[0].props.onChange({ target: { value: text } }); },
    confirm(value) { confirm = value; },
  };
}

for (const first of [0, 1]) {
  test(`sync mode ${first} blocks both modes before rerender and releases after success`, async () => {
    const page = mount(); page.input("架空の予約メール");
    const buttons = page.buttons();
    const pending = buttons[first].props.onClick();
    void buttons[first].props.onClick();
    void buttons[1 - first].props.onClick();
    assert.equal(page.requests.length, 1);
    assert.ok(page.buttons().every(button => button.props.disabled));
    page.requests[0].resolve({ ok: true, json: async () => ({ ok: true, count: 1 }) });
    await pending;
    assert.ok(page.buttons().every(button => !button.props.disabled));
    const next = page.buttons()[1 - first].props.onClick();
    assert.equal(page.requests.length, 2);
    page.requests[1].resolve({ ok: true, json: async () => ({ ok: true }) });
    await next;
  });
}

test("network, JSON and partial failures release both buttons for explicit retry", async () => {
  for (const failure of ["network", "json", "partial"]) {
    const page = mount(); page.input("架空の予約メール");
    const pending = page.buttons()[0].props.onClick();
    assert.ok(page.buttons().every(button => button.props.disabled));
    if (failure === "network") page.requests[0].reject(new Error("offline"));
    else page.requests[0].resolve({ ok: false, json: async () => {
      if (failure === "json") throw new Error("bad JSON");
      return { ok: false, partial: true, syncedCount: 1, failedCount: 1 };
    } });
    await pending;
    assert.ok(page.buttons().every(button => !button.props.disabled));
    assert.equal(page.alerts.length, 1);
    const retry = page.buttons()[1].props.onClick();
    assert.equal(page.requests.length, 2);
    page.requests[1].resolve({ ok: false, json: async () => ({ ok: false, error: "fixture failure" }) });
    await retry;
    assert.ok(page.buttons().every(button => !button.props.disabled));
  }
});

test("cancelled confirmation and empty manual text never acquire a stuck lock", async () => {
  const page = mount(); page.confirm(false);
  await page.buttons()[0].props.onClick();
  await page.buttons()[1].props.onClick();
  assert.equal(page.requests.length, 0);
  assert.ok(page.buttons().every(button => !button.props.disabled));
  page.confirm(true);
  const pending = page.buttons()[0].props.onClick();
  assert.equal(page.requests.length, 1);
  page.requests[0].resolve({ ok: true, json: async () => ({ ok: true }) });
  await pending;
});
