// Run: node --test tests/expense-receipt-image.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL("../app/expenses/ExpenseReceiptImage.tsx", import.meta.url),
  "utf8"
);
const listPage = readFileSync(
  new URL("../app/expenses/page.tsx", import.meta.url),
  "utf8"
);
const editPage = readFileSync(
  new URL("../app/expenses/[id]/page.tsx", import.meta.url),
  "utf8"
);

test("expense receipts use one configured Next Image component", () => {
  assert.match(component, /import Image from "next\/image"/);
  assert.match(component, /variant: "detail" \| "list" \| "report"/);
  assert.match(component, /sizes: "140px"/);
  assert.match(component, /sizes: "\(max-width: 768px\) min\(220px, 100vw\), 220px"/);
  assert.equal((listPage.match(/<ExpenseReceiptImage/g) ?? []).length, 2);
  assert.equal((editPage.match(/<ExpenseReceiptImage/g) ?? []).length, 1);
  assert.doesNotMatch(listPage, /<img\s/);
  assert.doesNotMatch(editPage, /<img\s/);
});
