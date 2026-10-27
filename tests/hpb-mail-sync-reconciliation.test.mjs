import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "@/lib/reservation-status") {
        return loadTypeScriptModule("../lib/reservation-status.ts");
      }
      return require(name);
    },
  });
  return exports;
}

const reconciliation = loadTypeScriptModule(
  "../lib/hpb-mail-sync-reconciliation.ts"
);
const externalReservationMetadata = loadTypeScriptModule(
  "../lib/external-reservation-metadata.ts"
);
const summary = loadTypeScriptModule("../lib/hpb-gmail-sync-summary.ts");

test("external reservation and customer IDs are stable and namespaced", () => {
  const first = reconciliation.buildExternalReservationId("hpb", "A123456");

  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(
    first,
    reconciliation.buildExternalReservationId("hpb", "A123456")
  );
  assert.notEqual(
    first,
    reconciliation.buildExternalReservationId("minimo", "A123456")
  );
  assert.notEqual(
    first,
    reconciliation.buildExternalCustomerId("hpb", "A123456")
  );
});

test("external reservation IDs are stable across case and width variants", () => {
  const canonical = reconciliation.buildExternalReservationId(
    "minimo",
    "MINIMO-123"
  );

  assert.equal(
    canonical,
    reconciliation.buildExternalReservationId("minimo", "ｍｉｎｉｍｏ－１２３")
  );
  assert.equal(
    canonical,
    reconciliation.buildExternalReservationId("minimo", " minimo-123 ")
  );
});

test("manual reservation lookup tolerates a small staff-entry time difference", () => {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        reconciliation.buildManualReservationLookupWindow(
          "2026-10-19T01:00:00.000Z"
        )
      )
    ),
    {
      from: "2026-10-19T00:55:00.000Z",
      to: "2026-10-19T01:05:00.000Z",
    }
  );
});

test("manual reservation lookup rejects an invalid timestamp", () => {
  assert.throws(
    () => reconciliation.buildManualReservationLookupWindow("invalid"),
    /開始日時を照合できません/
  );
});

test("mail sync uses the bounded lookup window instead of exact timestamp equality", () => {
  const source = readFileSync(
    new URL("../lib/hpb-mail-sync.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /buildManualReservationLookupWindow\(parsed\.startAt\)/);
  assert.match(source, /\.gte\("start_at", lookupWindow\.from\)/);
  assert.match(source, /\.lte\("start_at", lookupWindow\.to\)/);
  assert.doesNotMatch(source, /\.eq\("start_at", parsed\.startAt\)/);
});

test("an exact previously synced mail body is recognized across line endings", () => {
  assert.equal(
    reconciliation.hasSyncedMailBody({
      memo: "HPB予約番号：A123456\r\n【HPBメール本文】\r\n予約番号：A123456\r\n氏名：テスト顧客",
      sourceLabel: "HPB",
      rawText: "予約番号：A123456\n氏名：テスト顧客",
    }),
    true
  );
});

test("a changed provider mail is not mistaken for an already synced replay", () => {
  assert.equal(
    reconciliation.hasSyncedMailBody({
      memo: "ミニモ予約ID：M123\n【ミニモメール本文】\n来店日時：2099年10月20日 10:00",
      sourceLabel: "ミニモ",
      rawText: "来店日時：2099年10月20日 11:00",
    }),
    false
  );
});

test("external reservation lookup requires an exact memo line", () => {
  const result = reconciliation.findExternalReservationCandidate({
    source: "hpb",
    reservationNumber: "A123456",
    candidates: [
      {
        id: "longer-prefix",
        memo: "HPB予約番号：A1234567\n別の予約",
      },
      {
        id: "exact",
        memo: "既存メモ\r\n HPB予約番号：A123456 \r\nメール本文",
      },
    ],
  });

  assert.equal(result?.id, "exact");
});

test("external reservation lookup treats minimo pattern characters literally", () => {
  const result = reconciliation.findExternalReservationCandidate({
    source: "minimo",
    reservationNumber: "AB_12%34",
    candidates: [
      {
        id: "similar",
        memo: "ミニモ予約ID：ABX12Y34",
      },
      {
        id: "exact",
        memo: "ミニモ予約ID：AB_12%34",
      },
    ],
  });

  assert.equal(result?.id, "exact");
});

test("external reservation lookup matches legacy lowercase and full-width IDs", () => {
  const result = reconciliation.findExternalReservationCandidate({
    source: "minimo",
    reservationNumber: "MINIMO-123",
    candidates: [
      {
        id: "legacy-width",
        memo: "既存メモ\nミニモ予約ＩＤ：ｍｉｎｉｍｏ－１２３\nメール本文",
      },
      {
        id: "different",
        memo: "ミニモ予約ID：MINIMO-1234",
      },
    ],
  });

  assert.equal(result?.id, "legacy-width");
});

test("duplicate normalized external reservation keys stop before an update", () => {
  assert.throws(
    () =>
      reconciliation.findExternalReservationCandidate({
        source: "minimo",
        reservationNumber: "MINIMO-123",
        candidates: [
          { id: "canonical", memo: "ミニモ予約ID：MINIMO-123" },
          { id: "legacy", memo: "ミニモ予約ＩＤ：ｍｉｎｉｍｏ－１２３" },
        ],
      }),
    /同期を停止/
  );
});

test("duplicate exact external reservation keys stop before an update", () => {
  assert.throws(
    () =>
      reconciliation.findExternalReservationCandidate({
        source: "hpb",
        reservationNumber: "A123456",
        candidates: [
          { id: "first", memo: "HPB予約番号：A123456" },
          { id: "second", memo: "HPB予約番号：A123456" },
        ],
      }),
    /同期を停止/
  );
});

test("delayed mail sync adopts one matching manual external reservation", () => {
  const result = reconciliation.findManualReservationCandidate({
    source: "hpb",
    staffId: "staff-1",
    candidates: [
      {
        id: "manual-1",
        customer_id: "customer-1",
        staff_id: "staff-1",
        menu: "ホットペッパー予約",
        memo: "電話を受けて先に登録",
        status: "予約確定",
      },
      {
        id: "other-staff",
        customer_id: "customer-1",
        staff_id: "staff-2",
        menu: "ホットペッパー予約",
        memo: null,
        status: "予約確定",
      },
      {
        id: "already-synced",
        customer_id: "customer-1",
        staff_id: "staff-1",
        menu: "ホットペッパー予約",
        memo: "HPB予約番号：A999999",
        status: "confirmed",
      },
    ],
  });

  assert.equal(result?.id, "manual-1");
});

test("delayed mail sync may fill an unassigned manual reservation from the provider staff", () => {
  const result = reconciliation.findManualReservationCandidate({
    source: "hpb",
    staffId: "staff-1",
    customerId: "customer-1",
    candidates: [
      {
        id: "unassigned-manual",
        customer_id: "customer-1",
        staff_id: null,
        menu: "ジェル付替 90分",
        memo: "電話を受けて先に登録",
        status: "予約確定",
      },
      {
        id: "other-assignee",
        customer_id: "customer-1",
        staff_id: "staff-2",
        menu: "ホットペッパー予約",
        memo: null,
        status: "予約確定",
      },
    ],
  });

  assert.equal(result?.id, "unassigned-manual");
});

test("manual external source remains identifiable after its display title is customized", () => {
  const memo = externalReservationMetadata.buildExternalReservationMemo(
    "ホットペッパー",
    "電話を受けて先に登録"
  );
  const result = reconciliation.findManualReservationCandidate({
    source: "hpb",
    staffId: "staff-1",
    candidates: [
      {
        id: "manual-custom-title",
        customer_id: "customer-1",
        staff_id: "staff-1",
        menu: "ジェル付替 90分",
        memo,
        status: "予約確定",
      },
    ],
  });

  assert.equal(
    memo,
    "外部予約種別：ホットペッパー\n電話を受けて先に登録"
  );
  assert.equal(result?.id, "manual-custom-title");
});

test("cancelled manual rows are not adopted", () => {
  const result = reconciliation.findManualReservationCandidate({
    source: "minimo",
    staffId: null,
    candidates: [
      {
        id: "cancelled-1",
        customer_id: "customer-1",
        staff_id: null,
        menu: "ミニモ予約",
        memo: null,
        status: "キャンセル",
      },
    ],
  });

  assert.equal(result, null);
});

test("delayed mail sync adopts an unmarked manual reservation for the same customer", () => {
  const result = reconciliation.findManualReservationCandidate({
    source: "hpb",
    staffId: "staff-1",
    customerId: "customer-1",
    candidates: [
      {
        id: "same-customer",
        customer_id: "customer-1",
        staff_id: "staff-1",
        menu: "ジェル付替 90分",
        memo: "電話を受けて先に登録",
        status: "予約確定",
      },
      {
        id: "different-customer",
        customer_id: "customer-2",
        staff_id: "staff-1",
        menu: "ジェル付替 90分",
        memo: null,
        status: "予約確定",
      },
    ],
  });

  assert.equal(result?.id, "same-customer");
});

test("customer fallback does not adopt a reservation marked as the other external source", () => {
  const result = reconciliation.findManualReservationCandidate({
    source: "hpb",
    staffId: "staff-1",
    customerId: "customer-1",
    candidates: [
      {
        id: "minimo-customer",
        customer_id: "customer-1",
        staff_id: "staff-1",
        menu: "ジェル付替 90分",
        memo: "外部予約種別：ミニモ",
        status: "予約確定",
      },
    ],
  });

  assert.equal(result, null);
});

test("resolved customer disambiguates source-marked bookings in the same time window", () => {
  const result = reconciliation.findManualReservationCandidate({
    source: "hpb",
    staffId: null,
    customerId: "customer-1",
    candidates: [
      {
        id: "different-customer",
        customer_id: "customer-2",
        staff_id: "staff-2",
        menu: "ホットペッパー予約",
        memo: null,
        status: "予約確定",
      },
      {
        id: "matching-customer",
        customer_id: "customer-1",
        staff_id: "staff-1",
        menu: "ホットペッパー予約",
        memo: null,
        status: "予約確定",
      },
    ],
  });

  assert.equal(result?.id, "matching-customer");
});

test("a source-marked booking for another resolved customer remains a hard conflict", () => {
  assert.throws(
    () =>
      reconciliation.findManualReservationCandidate({
        source: "hpb",
        staffId: null,
        customerId: "customer-1",
        candidates: [
          {
            id: "different-customer",
            customer_id: "customer-2",
            staff_id: "staff-2",
            menu: "ホットペッパー予約",
            memo: null,
            status: "予約確定",
          },
        ],
      }),
    /顧客.*一致.*同期を停止/
  );
});

test("replayed cancellation mail does not grow the reservation memo", () => {
  const first = reconciliation.appendExternalCancellationMemo({
    existingMemo: "HPB予約番号：A123456",
    sourceLabel: "HPB",
    rawText: "予約A123456はキャンセルされました",
  });
  const replayed = reconciliation.appendExternalCancellationMemo({
    existingMemo: first,
    sourceLabel: "HPB",
    rawText: "予約A123456はキャンセルされました",
  });

  assert.equal(
    first,
    "HPB予約番号：A123456\n\n【HPBキャンセルメール本文】\n予約A123456はキャンセルされました"
  );
  assert.equal(replayed, first);
  assert.equal(reconciliation.isCancelledReservationStatus("キャンセル"), true);
  assert.equal(reconciliation.isCancelledReservationStatus("confirmed"), false);
});

test("ambiguous delayed manual entries stop instead of creating another row", () => {
  assert.throws(
    () =>
      reconciliation.findManualReservationCandidate({
        source: "minimo",
        staffId: null,
        candidates: [
          {
            id: "manual-1",
            customer_id: "customer-1",
            staff_id: "staff-1",
            menu: "ミニモ予約",
            memo: null,
            status: "予約確定",
          },
          {
            id: "manual-2",
            customer_id: "customer-2",
            staff_id: "staff-2",
            menu: "minimo booking",
            memo: null,
            status: "confirmed",
          },
        ],
      }),
    /同期を停止/
  );
});

test("Gmail sync summary does not report skipped or failed mail as synced", () => {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        summary.summarizeGmailSyncResults([
          { ok: true, skipped: false },
          { ok: false, skipped: false },
          { skipped: true },
        ])
      )
    ),
    {
      processedCount: 3,
      syncedCount: 1,
      skippedCount: 1,
      failedCount: 1,
    }
  );
});
