import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/visitPhotoStorage.ts", import.meta.url), "utf8");
const exports = {};

vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports, Uint8Array, crypto });

function file(type, size, bytes) {
  return { type, size, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
}

test("only JPEG, PNG and WebP under 5MB are accepted at selection", () => {
  assert.equal(exports.validateVisitPhotoMetadata(file("image/jpeg", 100, [0xff])).extension, "jpg");
  assert.equal(exports.validateVisitPhotoMetadata(file("image/png", 100, [0x89])).extension, "png");
  assert.throws(() => exports.validateVisitPhotoMetadata(file("image/gif", 100, [])), /JPEG・PNG・WebP/);
  assert.throws(() => exports.validateVisitPhotoMetadata(file("image/png", 5 * 1024 * 1024 + 1, [])), /5MB/);
});

test("upload validation uses image bytes and canonicalizes the stored extension", async () => {
  const pngNamedJpeg = file("image/jpeg", 12, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const validated = await exports.validateVisitPhotoFile(pngNamedJpeg);
  assert.equal(validated.contentType, "image/png");
  assert.equal(validated.extension, "png");
  await assert.rejects(
    exports.validateVisitPhotoFile(file("image/jpeg", 10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    /内容を確認できませんでした/
  );
});

test("storage paths only allow UUID visit IDs and use a generated filename", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.match(exports.createVisitPhotoPath(id, "webp"), new RegExp(`^${id}/photo-[0-9a-f-]+\\.webp$`));
  assert.throws(() => exports.createVisitPhotoPath("../visit", "jpg"), /保存先/);
});
