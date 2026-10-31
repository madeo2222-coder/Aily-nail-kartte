import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const reservationStatusExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../lib/reservation-status.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { exports: reservationStatusExports, Set, String }
);
const externalReservationMetadataExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/external-reservation-metadata.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: externalReservationMetadataExports },
);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/external-calendar-tasks/page.tsx", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
).outputText;

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ["2026-09-28T00:00:00Z"]));
  }
}

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function mount({
  failure = false,
  rejection = false,
  empty = false,
  reservation = {},
} = {}) {
  const states = [];
  const requests = [];
  let cursor = 0;
  let effect;
  let shouldFail = failure;

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
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useEffect: fn => { effect = fn; },
  };

  async function fetchMock(url, options) {
    requests.push({ url, options });

    if (shouldFail && rejection) throw new Error("offline");

    if (shouldFail) {
      return {
        ok: false,
        async json() {
          return { ok: false, error: "read failed" };
        },
      };
    }

    return {
      ok: true,
      async json() {
        if (empty) {
          return { ok: true, reservations: [], customers: [], staffs: [] };
        }

        return {
          ok: true,
          reservations: [{
          id: "reservation-1",
          customer_id: "customer-1",
          staff_id: "staff-1",
          menu: "ワンカラー",
          start_at: "2026-09-30T01:00:00Z",
          end_at: "2026-09-30T02:00:00Z",
          status: "confirmed",
          memo: null,
          ...reservation,
          }],
          customers: [{ id: "customer-1", name: "顧客A" }],
          staffs: [{ id: "staff-1", name: "黒木" }],
        };
      },
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date: FixedDate,
    Intl,
    Map,
    Set,
    Promise,
    console: { error() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: fetchMock,
    window: {
      localStorage: {
        getItem() { return null; },
        setItem() {},
      },
      setTimeout() {},
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "next/link") return { default: "a" };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/lib/reservation-status") return reservationStatusExports;
      if (name === "@/lib/external-reservation-metadata") {
        return externalReservationMetadataExports;
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function tree() {
    cursor = 0;
    return exports.default();
  }

  function html() {
    return renderToStaticMarkup(tree());
  }

  assert.match(html(), /読み込み中/);
  tree();
  effect();
  await setImmediate();

  return {
    requests,
    html,
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button);
      shouldFail = false;
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
  };
}

test("external calendar tasks hides incomplete work after API error", async () => {
  const page = await mount({ failure: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(
    page.html(),
    /0件|外部カレンダーへ反映が必要な予約はありません|反映待ちのみ|顧客A|黒木/
  );
  assert.deepEqual(JSON.parse(JSON.stringify(page.requests)), [{
    url: "/api/external-calendar-tasks",
    options: { cache: "no-store" },
  }]);
});

test("external calendar tasks handles a rejected API request", async () => {
  const page = await mount({ failure: true, rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /0件|外部カレンダーへ反映が必要な予約はありません/);
});

test("external calendar tasks recovers after retry", async () => {
  const page = await mount({ failure: true });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /反映待ち[\s\S]*1件/);
  assert.match(page.html(), /顧客A|黒木|ワンカラー/);
});

test("external calendar tasks preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /0件|外部カレンダーへ反映が必要な予約はありません/);
});

for (const reservation of [
  { source: "ＨＰＢ", memo: null },
  { source: null, memo: "ｈｐｂ予約番号：Ａ１２３４５６" },
  { source: "ＭＩＮＩＭＯ", memo: null },
]) {
  test(`external calendar tasks excludes a normalized external reservation: ${JSON.stringify(reservation)}`, async () => {
    const page = await mount({ reservation });

    assert.doesNotMatch(page.html(), /role="alert"/);
    assert.match(
      page.html(),
      /0件|外部カレンダーへ反映が必要な予約はありません/,
    );
    assert.doesNotMatch(page.html(), /顧客A|黒木|ワンカラー/);
  });
}

for (const memo of [
  "ミニモで見たデザインを希望",
  "ホットペッパーの写真と同じ色を希望",
]) {
  test(`external calendar tasks keeps a customer-app reservation with a site mention: ${memo}`, async () => {
    const page = await mount({ reservation: { source: "customer-app", memo } });

    assert.doesNotMatch(page.html(), /role="alert"/);
    assert.match(page.html(), /反映待ち[\s\S]*1件/);
    assert.match(page.html(), /顧客A|黒木|ワンカラー/);
  });
}
