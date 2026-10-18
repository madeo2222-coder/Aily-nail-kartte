// Run: node --test tests/remaining-photo-images.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("customer detail uses responsive Next Image for photos and signature", () => {
  const page = source("../app/customers/[id]/page.tsx");
  assert.match(page, /import Image from "next\/image"/);
  assert.equal((page.match(/<Image/g) ?? []).length, 3);
  assert.match(page, /sizes="\(max-width: 768px\) 50vw, 25vw"/);
  assert.match(page, /sizes="\(max-width: 768px\) calc\(100vw - 4rem\), 768px"/);
  assert.match(page, /unoptimized/);
  assert.doesNotMatch(page, /<img\s/);
});

test("design gallery uses responsive Next Image", () => {
  const page = source("../app/designs/paga.tsx");
  assert.match(page, /import Image from "next\/image"/);
  assert.match(page, /<Image/);
  assert.match(page, /sizes="\(max-width: 768px\) calc\(100vw - 2rem\), \(max-width: 1280px\) 50vw, 33vw"/);
  assert.doesNotMatch(page, /<img\s/);
});
