import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/inbound-nail-tip-requests/page.tsx", import.meta.url),
  "utf8"
);

test("inbound nail-tip reference images use responsive Next Image cards", () => {
  assert.match(source, /import Image from "next\/image"/);
  assert.match(source, /<Image\s+[\s\S]*?src=\{url\}[\s\S]*?alt="参考画像"[\s\S]*?fill/);
  assert.match(
    source,
    /sizes="\(max-width: 767px\) calc\(100vw - 72px\), 288px"/
  );
  assert.match(source, /className="object-cover"/);
  assert.doesNotMatch(source, /<img\s+[\s\S]*?src=\{url\}/);
});

test("reference image cards still link to the original upload", () => {
  assert.match(
    source,
    /<a\s+[\s\S]*?href=\{url\}[\s\S]*?target="_blank"[\s\S]*?rel="noreferrer"/
  );
});
