import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const hpbGmailSyncUnknownLockExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/hpb-gmail-sync-unknown-lock.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: hpbGmailSyncUnknownLockExports, JSON, Number },
);
const hpbManualSyncUnknownLockExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/hpb-manual-sync-unknown-lock.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: hpbManualSyncUnknownLockExports, JSON, Math, Number },
);
const compiled = ts.transpileModule(readFileSync(new URL("../app/hpb-mail-sync-test/page.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function nodes(node, type) {
  if (!node || typeof node !== "object") return [];
  return [...(node.type === type ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => nodes(child, type))];
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function mount({ storage = createStorage() } = {}) {
  const states = [];
  let cursor = 0;
  const requests = [];
  const alerts = [];
  let confirm = true;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console: { error() {} }, alert: text => alerts.push(text), window: {
      confirm: () => confirm,
      localStorage: storage,
      setTimeout() { return 1; },
      clearTimeout() {},
    },
    fetch(url, options) { return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })); },
    require(name) {
      if (name === "react") return {
        useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
        useRef(initial) { const i = cursor++; return states[i] ??= { current: initial }; },
        useMemo(fn) { return fn(); },
        useEffect(fn) { fn(); },
      };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/hpb-gmail-sync-unknown-lock") {
        return hpbGmailSyncUnknownLockExports;
      }
      if (name === "@/lib/hpb-manual-sync-unknown-lock") {
        return hpbManualSyncUnknownLockExports;
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function render() { cursor = 0; return exports.default(); }
  render();
  return {
    requests, alerts,
    buttons: () => nodes(render(), "button"),
    subject(text) { nodes(render(), "input")[0].props.onChange({ target: { value: text } }); },
    input(text) { nodes(render(), "textarea")[0].props.onChange({ target: { value: text } }); },
    confirm(value) { confirm = value; },
  };
}

test("manual sync sends the mail subject with the body", async () => {
  const page = mount();
  page.subject("【キャンセル】ご予約内容のお知らせ");
  page.input("架空の予約メール本文");

  const pending = page.buttons()[1].props.onClick();
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, "/api/hpb-mail-sync");
  assert.deepEqual(JSON.parse(page.requests[0].options.body), {
    subject: "【キャンセル】ご予約内容のお知らせ",
    text: "架空の予約メール本文",
  });

  page.requests[0].resolve({
    ok: true,
    json: async () => ({ ok: true }),
  });
  await pending;
});

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

test("Gmail response loss locks Gmail but keeps targeted manual recovery available", async () => {
  for (const failure of ["network", "json"]) {
    const page = mount(); page.input("架空の予約メール");
    const pending = page.buttons()[0].props.onClick();
    assert.ok(page.buttons().every(button => button.props.disabled));
    if (failure === "network") page.requests[0].reject(new Error("offline"));
    else page.requests[0].resolve({ ok: true, json: async () => {
      throw new Error("bad JSON");
    } });
    await pending;
    assert.equal(page.buttons()[0].props.disabled, true);
    assert.equal(page.buttons()[1].props.disabled, false);
    assert.equal(page.alerts.length, 1);
    assert.match(page.alerts[0], /結果を確認できませんでした/);
    assert.equal(
      page.buttons()[0].props.children,
      "同期結果を確認してください",
    );
    assert.equal(
      page.buttons()[1].props.children,
      "予約メール本文を同期テスト",
    );
    await page.buttons()[0].props.onClick();
    assert.equal(page.requests.length, 1);
  }
});

test("Gmail unknown-result lock is shared with the calendar across reloads", async () => {
  const storage = createStorage();
  hpbGmailSyncUnknownLockExports.saveHpbGmailSyncUnknownLock(
    storage,
    true,
    Date.now(),
  );
  const page = mount({ storage });

  assert.equal(page.buttons()[0].props.disabled, true);
  assert.equal(page.buttons()[0].props.children, "同期結果を確認してください");
  assert.equal(page.buttons()[1].props.disabled, false);

  await page.buttons()[0].props.onClick();
  assert.equal(page.requests.length, 0);

  page.input("未反映の予約メール本文");
  const manual = page.buttons()[1].props.onClick();
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, "/api/hpb-mail-sync");
  page.requests[0].resolve({ ok: true, json: async () => ({ ok: true }) });
  await manual;
});

test("partial and explicit API failures release both buttons for retry", async () => {
  for (const failure of ["partial", "explicit"]) {
    const page = mount(); page.input("架空の予約メール");
    const pending = page.buttons()[0].props.onClick();
    assert.ok(page.buttons().every(button => button.props.disabled));
    page.requests[0].resolve({
      ok: false,
      json: async () => failure === "partial"
        ? { ok: false, partial: true, syncedCount: 1, failedCount: 1 }
        : { ok: false, error: "fixture failure" },
    });
    await pending;
    assert.ok(page.buttons().every(button => !button.props.disabled));
    assert.equal(page.alerts.length, 1);
    const retry = page.buttons()[1].props.onClick();
    assert.equal(page.requests.length, 2);
    page.requests[1].resolve({ ok: true, json: async () => ({ ok: true }) });
    await retry;
  }
});

test("manual mail response loss locks Gmail and manual retries", async () => {
  const page = mount(); page.input("架空の予約メール");
  const pending = page.buttons()[1].props.onClick();
  assert.equal(page.requests.length, 1);
  page.requests[0].reject(new Error("offline"));
  await pending;

  assert.ok(page.buttons().every(button => button.props.disabled));
  assert.ok(
    page.buttons().every(
      button => button.props.children === "同期結果を確認してください",
    ),
  );
  assert.match(page.alerts[0], /手動同期の結果を確認できませんでした/);
  await page.buttons()[0].props.onClick();
  assert.equal(page.requests.length, 1);
});

test("manual response loss blocks the same mail after reload but allows another mail", async () => {
  const storage = createStorage();
  const first = mount({ storage });
  first.subject("予約変更");
  first.input("結果不明になった予約メール");
  const pending = first.buttons()[1].props.onClick();
  first.requests[0].reject(new Error("offline"));
  await pending;

  const reloaded = mount({ storage });
  assert.equal(reloaded.buttons()[0].props.disabled, true);
  assert.equal(reloaded.buttons()[1].props.disabled, false);

  reloaded.subject("予約変更");
  reloaded.input("結果不明になった予約メール");
  await reloaded.buttons()[1].props.onClick();
  assert.equal(reloaded.requests.length, 0);
  assert.match(reloaded.alerts[0], /直前の同期結果を確認できていません/);

  const another = mount({ storage });
  another.subject("新規予約");
  another.input("別の予約メール");
  const anotherPending = another.buttons()[1].props.onClick();
  assert.equal(another.requests.length, 1);
  another.requests[0].resolve({
    ok: true,
    json: async () => ({ ok: true }),
  });
  await anotherPending;
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
