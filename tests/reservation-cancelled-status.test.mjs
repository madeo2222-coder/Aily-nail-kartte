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

test("confirmed reservation states share width and whitespace normalization", () => {
  for (const status of [
    "confirmed",
    "予約確定",
    " CONFIRMED ",
    "ＣＯＮＦＩＲＭＥＤ",
    "予 約 確 定",
  ]) {
    assert.equal(exports.isConfirmedReservationStatus(status), true, status);
  }

  for (const status of [null, "", "requested", "予約", "completed", "キャンセル"]) {
    assert.equal(exports.isConfirmedReservationStatus(status), false, status);
  }
});

test("completed reservation states share width and whitespace normalization", () => {
  for (const status of [
    "completed",
    "完了",
    " COMPLETED ",
    "ＣＯＭＰＬＥＴＥＤ",
    "完 了",
  ]) {
    assert.equal(exports.isCompletedReservationStatus(status), true, status);
  }

  for (const status of [null, "", "requested", "confirmed", "予約", "キャンセル"]) {
    assert.equal(exports.isCompletedReservationStatus(status), false, status);
  }
});

test("staff-progressed reservation states are normalized consistently", () => {
  for (const status of [
    "来店",
    "来店予定",
    "完了待ち",
    "完了",
    "completed",
    " COMPLETED ",
    "ＣＯＭＰＬＥＴＥＤ",
  ]) {
    assert.equal(exports.isProgressedReservationStatus(status), true, status);
  }
});

test("new and cancelled reservation states are not staff-progressed", () => {
  for (const status of [
    null,
    "",
    "requested",
    "confirmed",
    "予約",
    "キャンセル",
    "cancelled",
  ]) {
    assert.equal(exports.isProgressedReservationStatus(status), false, status);
  }
});

test("legacy width and whitespace variants keep their staff workflow labels", () => {
  assert.equal(
    exports.getReservationStatusLabel(" ＣＯＮＦＩＲＭＥＤ "),
    "予約確定",
  );
  assert.equal(
    exports.getReservationStatusLabel(" 完 了 待 ち "),
    "完了待ち",
  );
});
