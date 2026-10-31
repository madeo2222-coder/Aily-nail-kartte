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
    new URL("../app/reservations/calendar/page.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;

class FixedDate extends Date {
  constructor(...args) {
    // Noon UTC keeps the calendar date stable across runner time zones.
    super(...(args.length ? args : ["2026-09-28T12:00:00Z"]));
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
  reservationStatus = "confirmed",
  reservationSource = "Naily",
  reservationMemo = null,
  hpbOutcomes = ["success"],
  externalBlock = false,
  externalBlockSource = "HPB",
  externalBlockTitle = "外部予約",
  externalBlockMemo = "受付番号123",
  deleteOutcomes = ["success"],
} = {}) {
  const states = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let collectEffects = true;
  let shouldFail = failure;
  const alerts = [];
  const pendingHpbOutcomes = [...hpbOutcomes];
  const pendingDeleteOutcomes = [...deleteOutcomes];
  let externalBlockExists = externalBlock;

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
    useEffect: fn => {
      if (collectEffects) effects.push(fn);
    },
  };

  function calendarPayload() {
    if (empty) {
      return {
        ok: true,
        reservations: [],
        externalBlocks: [],
        customers: [],
        staffs: [],
        visits: [],
        customerIntakes: [],
      };
    }

    return {
      ok: true,
      reservations: [{
          id: "reservation-1",
          customer_id: "customer-1",
          staff_id: "staff-1",
          menu: "ワンカラー",
          status: reservationStatus,
          memo: reservationMemo,
          source: reservationSource,
          start_at: "2026-09-28T01:00:00Z",
          end_at: "2026-09-28T02:00:00Z",
          created_at: "2026-09-27T00:00:00Z",
      }],
      externalBlocks: externalBlockExists
        ? [{
            id: "block-1",
            salon_id: "salon-1",
            staff_id: "staff-1",
            source: externalBlockSource,
            title: externalBlockTitle,
            start_at: "2026-09-28T01:00:00Z",
            end_at: "2026-09-28T02:00:00Z",
            memo: externalBlockMemo,
            created_at: "2026-09-27T00:00:00Z",
          }]
        : [],
      customers: [{ id: "customer-1", name: "顧客A" }],
      staffs: [{ id: "staff-1", name: "黒木" }],
      visits: [{
          customer_id: "customer-1",
          visit_date: "2026-09-01",
          menu_name: "前回メニュー",
          menu: null,
          memo: "前回メモ",
          next_proposal: "次回提案",
      }],
      customerIntakes: [{
        customer_id: "customer-1",
        allergy: "アレルギーあり",
        skin_trouble: null,
        constitution: null,
        avoid_items: null,
        submitted_at: "2026-09-01T00:00:00Z",
        created_at: "2026-09-01T00:00:00Z",
      }],
    };
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date: FixedDate,
    Error,
    Intl,
    Map,
    Math,
    Number,
    Promise,
    Set,
    console: { error() {} },
    alert(message) {
      alerts.push(message);
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url === "/api/external-calendar-blocks/delete") {
        const outcome = pendingDeleteOutcomes.shift() || "success";
        if (outcome === "networkFailure") throw new Error("offline");
        if (outcome === "bodyLossAfterDelete") {
          externalBlockExists = false;
          return {
            ok: true,
            status: 200,
            json: async () => {
              throw new Error("response body lost");
            },
          };
        }
        if (outcome === "explicitFailure") {
          return {
            ok: false,
            status: 409,
            json: async () => ({ ok: false, error: "削除が競合しました" }),
          };
        }
        externalBlockExists = false;
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, id: "block-1" }),
        };
      }
      if (url !== "/api/reservations/calendar-data") {
        const outcome = pendingHpbOutcomes.shift() || "success";
        if (outcome === "networkFailure") throw new Error("offline");
        if (outcome === "invalidJson") {
          return {
            ok: true,
            status: 200,
            json: async () => {
              throw new Error("response body lost");
            },
          };
        }
        if (outcome === "explicitFailure") {
          return {
            ok: false,
            status: 502,
            json: async () => ({ ok: false, error: "同期APIが失敗しました" }),
          };
        }
        return { ok: true, json: async () => ({ ok: true, count: 0 }) };
      }
      if (shouldFail && rejection) throw new Error("offline");
      if (shouldFail) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: "read failed" }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => calendarPayload(),
      };
    },
    window: { confirm: () => true },
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

  const initialHtml = html();
  assert.match(initialHtml, /読み込み中/);
  assert.doesNotMatch(initialHtml, /重複は見つかっていません|予約今すぐ同期/);
  collectEffects = false;
  effects[0]();
  await setImmediate();

  return {
    html,
    requests,
    alerts,
    async syncOnce() {
      const button = findNode(
        tree(),
        node =>
          node.type === "button" &&
          ["予約今すぐ同期", "同期結果を確認してください"].includes(
            node.props.children,
          ),
      );
      assert.ok(button, "Gmail sync button exists");
      await button.props.onClick();
    },
    async syncTwiceBeforeRerender() {
      const button = findNode(
        tree(),
        node =>
          node.type === "button" &&
          node.props.children === "予約今すぐ同期",
      );
      assert.ok(button, "Gmail sync button exists");

      const first = button.props.onClick();
      const second = button.props.onClick();
      await Promise.all([first, second]);
    },
    async retry() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "再試行",
      );
      assert.ok(button, "retry button exists");
      shouldFail = false;
      button.props.onClick();
      assert.match(html(), /読み込み中/);
      await setImmediate();
    },
    async deleteBlockOnce() {
      const button = findNode(
        tree(),
        node =>
          node.type === "button" &&
          ["削除", "削除中..."].includes(node.props.children),
      );
      assert.ok(button, "external block delete button exists");
      await button.props.onClick();
      await setImmediate();
    },
    async deleteBlockTwiceBeforeRerender() {
      const button = findNode(
        tree(),
        node => node.type === "button" && node.props.children === "削除",
      );
      assert.ok(button, "external block delete button exists");
      const first = button.props.onClick();
      const second = button.props.onClick();
      await Promise.all([first, second]);
      await setImmediate();
    },
  };
}

test("reservation calendar hides incomplete data after API error", async () => {
  const page = await mount({ failure: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(
    page.html(),
    /0件|重複は見つかっていません|予約今すぐ同期|顧客A|黒木/,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(page.requests)), [{
    url: "/api/reservations/calendar-data",
    options: { cache: "no-store" },
  }]);
});

test("reservation calendar handles a rejected query", async () => {
  const page = await mount({ failure: true, rejection: true });
  assert.match(page.html(), /role="alert"/);
  assert.doesNotMatch(page.html(), /0件|重複は見つかっていません/);
});

test("reservation calendar recovers after retry", async () => {
  const page = await mount({ failure: true });
  await page.retry();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /黒木/);
  assert.match(page.html(), /ワンカラー/);
  assert.match(page.html(), /再来・1回来店/);
  assert.match(page.html(), /アレルギーあり/);
});

test("reservation calendar preserves a successful empty result", async () => {
  const page = await mount({ empty: true });
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /予約件数：\s*0件/);
  assert.match(page.html(), /重複は見つかっていません/);
});

test("reservation calendar renders complete successful data", async () => {
  const page = await mount();
  assert.doesNotMatch(page.html(), /role="alert"/);
  assert.match(page.html(), /顧客A/);
  assert.match(page.html(), /黒木/);
  assert.match(page.html(), /ワンカラー/);
});

test("reservation calendar keeps customer memo site mentions labeled as Naily", async () => {
  for (const reservationMemo of [
    "ミニモで見たデザインを希望",
    "ホットペッパーの写真と同じ色を希望",
  ]) {
    const page = await mount({ reservationMemo });
    const html = page.html();

    assert.match(html, /Naily予約/);
    assert.doesNotMatch(html, /HPB同期|ミニモ同期/);
  }
});

test("reservation calendar keeps contact-channel mentions in customer memo labeled as Naily", async () => {
  for (const reservationMemo of [
    "LINEで連絡希望",
    "Instagramの画像を参考",
    "インスタで見たデザイン",
    "電話してください",
  ]) {
    const page = await mount({ reservationMemo });
    const html = page.html();

    assert.match(
      html,
      /bg-blue-100 text-blue-700[^>]*>Naily予約<\/span>/,
    );
  }
});

test("reservation calendar labels explicit contact-channel sources", async () => {
  for (const [reservationSource, expectedBadge] of [
    ["LINE", /bg-emerald-100 text-emerald-700[^>]*>LINE予約<\/span>/],
    ["Instagram", /bg-pink-100 text-pink-700[^>]*>Instagram<\/span>/],
    ["phone", /bg-slate-200 text-slate-700[^>]*>電話予約<\/span>/],
  ]) {
    const page = await mount({ reservationSource });
    assert.match(page.html(), expectedBadge);
  }
});

test("reservation calendar keeps contact-channel inference for external blocks", async () => {
  const page = await mount({
    externalBlock: true,
    externalBlockSource: "manual",
    externalBlockMemo: "LINE受付",
  });

  assert.match(
    page.html(),
    /bg-emerald-100 text-emerald-700[^>]*>LINE予約<\/span>/,
  );
});

test("reservation calendar normalizes a legacy full-width confirmed status", async () => {
  const page = await mount({ reservationStatus: " ＣＯＮＦＩＲＭＥＤ " });
  const html = page.html();

  assert.match(html, /予約確定/);
  assert.match(html, /border-blue-200 bg-blue-100 text-blue-800/);
  assert.doesNotMatch(html, /ＣＯＮＦＩＲＭＥＤ/);
});

test("reservation calendar ignores a second Gmail sync click before rerender", async () => {
  const page = await mount();

  await page.syncTwiceBeforeRerender();

  assert.equal(
    page.requests.filter(request => request.url === "/api/hpb-gmail-sync")
      .length,
    1,
  );
});

for (const outcome of ["networkFailure", "invalidJson"]) {
  test(`reservation calendar locks a repeated Gmail sync after ${outcome}`, async () => {
    const page = await mount({ hpbOutcomes: [outcome] });

    await page.syncOnce();

    assert.match(page.html(), /予約同期の結果を確認できませんでした/);
    assert.match(page.html(), /同じ同期を繰り返さず/);
    assert.match(page.html(), /href="\/hpb-mail-sync-test"/);
    assert.match(page.html(), /同期結果を確認してください/);
    assert.equal(
      page.requests.filter(request => request.url === "/api/hpb-gmail-sync")
        .length,
      1,
    );
    assert.equal(
      page.requests.filter(
        request => request.url === "/api/reservations/calendar-data",
      ).length,
      2,
    );
    assert.match(page.alerts.at(-1), /予約同期センター/);

    await page.syncOnce();

    assert.equal(
      page.requests.filter(request => request.url === "/api/hpb-gmail-sync")
        .length,
      1,
    );
  });
}

test("reservation calendar allows retry after an explicit Gmail sync failure", async () => {
  const page = await mount({ hpbOutcomes: ["explicitFailure", "success"] });

  await page.syncOnce();

  assert.doesNotMatch(page.html(), /予約同期の結果を確認できませんでした/);
  assert.match(page.alerts.at(-1), /同期APIが失敗しました/);

  await page.syncOnce();

  assert.equal(
    page.requests.filter(request => request.url === "/api/hpb-gmail-sync")
      .length,
    2,
  );
});

test("reservation calendar ignores a second external block delete click before rerender", async () => {
  const page = await mount({ externalBlock: true });

  await page.deleteBlockTwiceBeforeRerender();

  assert.equal(
    page.requests.filter(
      request => request.url === "/api/external-calendar-blocks/delete",
    ).length,
    1,
  );
  assert.match(page.alerts.at(-1), /削除しました/);
});

test("reservation calendar refreshes after an external block delete response is lost", async () => {
  const page = await mount({
    externalBlock: true,
    deleteOutcomes: ["bodyLossAfterDelete"],
  });

  await page.deleteBlockOnce();

  assert.equal(
    page.requests.filter(
      request => request.url === "/api/external-calendar-blocks/delete",
    ).length,
    1,
  );
  assert.equal(
    page.requests.filter(
      request => request.url === "/api/reservations/calendar-data",
    ).length,
    2,
  );
  assert.match(page.alerts.at(-1), /カレンダーを再読み込み/);
  assert.doesNotMatch(page.html(), /受付番号123/);
});

test("reservation calendar allows retry after an explicit external block delete failure", async () => {
  const page = await mount({
    externalBlock: true,
    deleteOutcomes: ["explicitFailure", "success"],
  });

  await page.deleteBlockOnce();
  assert.match(page.alerts.at(-1), /削除が競合しました/);

  await page.deleteBlockOnce();
  assert.equal(
    page.requests.filter(
      request => request.url === "/api/external-calendar-blocks/delete",
    ).length,
    2,
  );
  assert.match(page.alerts.at(-1), /削除しました/);
});
