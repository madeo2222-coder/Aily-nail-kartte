import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};

  vm.runInNewContext(compiled, { exports });
  return exports;
}

const memoTools = loadModule("../lib/reservation-sync-memo.ts");

test("new staff memo is inserted without exposing or losing the HPB mail body", () => {
  const original = [
    "HPB予約番号：A123456",
    "予約者名：山田 花子",
    "",
    "【HPBメール本文】",
    "予約メール原文",
  ].join("\n");

  const editable = memoTools.readEditableReservationMemo(original);

  assert.equal(editable.displayMemo, "");
  assert.equal(editable.syncedMemo, original);

  const saved = memoTools.writeEditableReservationMemo(
    editable.syncedMemo,
    "電話でカラー変更を確認",
  );

  assert.match(saved, /【同期前の手入力メモ】\n電話でカラー変更を確認/);
  assert.match(saved, /【HPBメール本文】\n予約メール原文$/);
});

test("existing staff memo is edited without nesting the generated sync memo", () => {
  const original = [
    "ミニモ予約ID：M-123",
    "【同期前の手入力メモ】",
    "旧メモ",
    "",
    "【ミニモメール本文】",
    "申込メール原文",
  ].join("\n");

  const editable = memoTools.readEditableReservationMemo(original);
  const saved = memoTools.writeEditableReservationMemo(
    editable.syncedMemo,
    "新メモ",
  );

  assert.equal(editable.displayMemo, "旧メモ");
  assert.equal((saved.match(/【同期前の手入力メモ】/g) || []).length, 1);
  assert.doesNotMatch(saved, /旧メモ/);
  assert.match(saved, /【同期前の手入力メモ】\n新メモ/);
  assert.match(saved, /【ミニモメール本文】\n申込メール原文$/);
});

test("clearing staff memo removes only its section", () => {
  const original = [
    "HPB予約番号：A123456",
    "【同期前の手入力メモ】",
    "削除するメモ",
    "【HPBメール本文】",
    "本文内の【同期前の手入力メモ】は保持",
  ].join("\n");

  const saved = memoTools.writeEditableReservationMemo(original, "");

  assert.doesNotMatch(saved, /削除するメモ/);
  assert.match(saved, /【HPBメール本文】\n本文内の【同期前の手入力メモ】は保持$/);
});

test("gallery metadata and similar mail-body lines remain opaque sync content", () => {
  const original = [
    "Aily Gallery参考デザインあり",
    "参考写真URL：https://example.test/design.jpg",
    "HPB予約番号：A123456",
    "【HPBメール本文】",
    "参考写真URL：メール本文の原文",
  ].join("\n");

  const editable = memoTools.readEditableReservationMemo(original);
  const saved = memoTools.writeEditableReservationMemo(
    editable.syncedMemo,
    "スタッフ追記",
  );

  assert.equal(
    (saved.match(/Aily Gallery参考デザインあり/g) || []).length,
    1,
  );
  assert.match(saved, /参考写真URL：https:\/\/example\.test\/design\.jpg/);
  assert.match(saved, /参考写真URL：メール本文の原文$/);
});

test("ordinary reservation memo remains a normal editable memo", () => {
  const ordinary = "電話予約\r\nお客様希望カラー";
  const editable = memoTools.readEditableReservationMemo(ordinary);

  assert.equal(editable.displayMemo, "電話予約\nお客様希望カラー");
  assert.equal(editable.syncedMemo, null);
  assert.equal(memoTools.writeEditableReservationMemo(ordinary, "更新後"), "更新後");
});

test("reservation edit page uses separated staff and sync memo state", () => {
  const source = readFileSync(
    new URL("../app/reservations/edit/[id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /readEditableReservationMemo/);
  assert.match(source, /writeEditableReservationMemo/);
  assert.match(source, /setSyncedMemo\(editableMemo\.syncedMemo\)/);
  assert.match(source, /同期情報とメール本文は自動で保持されます/);
});
