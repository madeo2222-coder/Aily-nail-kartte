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

  vm.runInNewContext(compiled, { exports, require });
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

test("delayed mail sync adopts one matching manual external reservation", () => {
  const result = reconciliation.findManualReservationCandidate({
    source: "hpb",
    staffId: "staff-1",
    candidates: [
      {
        id: "manual-1",
        staff_id: "staff-1",
        menu: "ホットペッパー予約",
        memo: "電話を受けて先に登録",
        status: "予約確定",
      },
      {
        id: "other-staff",
        staff_id: "staff-2",
        menu: "ホットペッパー予約",
        memo: null,
        status: "予約確定",
      },
      {
        id: "already-synced",
        staff_id: "staff-1",
        menu: "ホットペッパー予約",
        memo: "HPB予約番号：A999999",
        status: "confirmed",
      },
    ],
  });

  assert.equal(result?.id, "manual-1");
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
        staff_id: null,
        menu: "ミニモ予約",
        memo: null,
        status: "キャンセル",
      },
    ],
  });

  assert.equal(result, null);
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
            staff_id: "staff-1",
            menu: "ミニモ予約",
            memo: null,
            status: "予約確定",
          },
          {
            id: "manual-2",
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
