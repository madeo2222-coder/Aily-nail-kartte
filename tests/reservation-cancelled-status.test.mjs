import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/reservation-status.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exports = {};

vm.runInNewContext(compiled, {
  exports,
  Set,
  String,
  require,
});

test("every supported reservation cancellation status shares one normalized result", () => {
  for (const status of [
    "キャンセル",
    "cancelled",
    "canceled",
    "cancel",
    "取消",
    "取り消し",
    " CANCELLED ",
    "ＣＡＮＣＥＬＬＥＤ",
    "取 り 消 し",
  ]) {
    assert.equal(exports.isCancelledReservationStatus(status), true, status);
  }
});

test("active and completed reservation states are never cancelled", () => {
  for (const status of [
    null,
    "",
    "requested",
    "confirmed",
    "予約",
    "来店",
    "完了",
    "completed",
  ]) {
    assert.equal(exports.isCancelledReservationStatus(status), false, status);
  }
});
