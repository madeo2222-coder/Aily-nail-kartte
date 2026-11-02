import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/nail-tip-order-submission.ts", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exports = {};
new Function("exports", "require", compiled)(exports, require);

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const submission = {
  luckyColor: "red",
  luckyStone: "ruby",
  nailTheme: "love",
  productCode: "ruby_love",
  designRequest: "simple",
  sizeStatus: "サイズ測定済み",
  deliveryRequest: "next month",
  requestKey: "11111111-1111-4111-8111-111111111111",
};

test("stores and restores the exact domestic nail-tip order", () => {
  const storage = createStorage();
  exports.savePendingNailTipOrderSubmission(storage, submission);
  assert.deepEqual(
    exports.readPendingNailTipOrderSubmission(storage),
    submission
  );
  exports.clearPendingNailTipOrderSubmission(storage);
  assert.equal(exports.readPendingNailTipOrderSubmission(storage), null);
});

test("rejects malformed recovery data instead of retrying it", () => {
  const storage = createStorage();
  storage.setItem(
    exports.NAIL_TIP_ORDER_SUBMISSION_KEY,
    JSON.stringify({ ...submission, requestKey: "invalid" })
  );
  assert.equal(exports.readPendingNailTipOrderSubmission(storage), null);
  assert.throws(() =>
    exports.savePendingNailTipOrderSubmission(storage, {
      ...submission,
      productCode: "",
    })
  );
});
