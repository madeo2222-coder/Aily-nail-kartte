import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailSource = readFileSync(
  new URL("../app/customers/[id]/intake/page.tsx", import.meta.url),
  "utf8"
);

const listSource = readFileSync(
  new URL("../app/customer-intake/list/page.tsx", import.meta.url),
  "utf8"
);

test("customer intake signature uses Next Image without optimizing its data URL", () => {
  assert.match(detailSource, /import Image from "next\/image"/);
  assert.match(detailSource, /<Image\s+[\s\S]*?src=\{latestIntake\.signature_data_url\}[\s\S]*?unoptimized/);
  assert.match(detailSource, /fill\s+[\s\S]*?sizes="\(max-width: 768px\) calc\(100vw - 64px\), 928px"/);
  assert.doesNotMatch(detailSource, /<img\s+[\s\S]*?src=\{latestIntake\.signature_data_url\}/);
});

test("customer intake list keeps signatures contained and left aligned", () => {
  assert.match(listSource, /import Image from "next\/image"/);
  assert.match(listSource, /<Image\s+[\s\S]*?src=\{intake\.signature_data_url\}[\s\S]*?unoptimized/);
  assert.match(listSource, /sizes="\(max-width: 1023px\) calc\(100vw - 80px\), 560px"/);
  assert.match(listSource, /className="object-contain object-left"/);
  assert.doesNotMatch(listSource, /<img\s+[\s\S]*?src=\{intake\.signature_data_url\}/);
});
