import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/customer-app/nail-tip-order/page.tsx", import.meta.url),
  "utf8"
);

test("guard is established before the order POST and prior to awaiting network", () => {
  const handler = source.slice(
    source.indexOf("async function handleSubmit()"),
    source.indexOf("function startAnotherConsultation()")
  );
  assert.ok(
    handler.indexOf("submitLockRef.current = true") <
      handler.indexOf('fetch("/api/nail-tip-orders"')
  );
  assert.ok(
    handler.indexOf(
      'sessionStorage.setItem(ORDER_SUBMISSION_STATE_KEY, "uncertain")'
    ) < handler.indexOf('fetch("/api/nail-tip-orders"')
  );
  assert.match(
    handler,
    /if \(submitLockRef.current \|\| submissionState !== "idle"\) return/
  );
  assert.doesNotMatch(
    handler,
    /fetch\("\/api\/nail-tip-orders"[\s\S]*fetch\("\/api\/nail-tip-orders"/
  );
});

test("ambiguous server errors and lost responses do not release the order guard", () => {
  const handler = source.slice(
    source.indexOf("async function handleSubmit()"),
    source.indexOf("function startAnotherConsultation()")
  );
  assert.match(
    handler,
    /\[400, 401, 403, 404, 422\]\.includes\(response\.status\)/
  );
  assert.match(
    handler,
    /catch \(error\)[\s\S]*setSubmissionState\("uncertain"\)/
  );
  assert.doesNotMatch(handler, /\[.*500.*\]\.includes\(response\.status\)/);
  assert.match(source, /previous === "uncertain" \|\| previous === "confirmed"/);
});

test("confirmed orders stay locked until explicit new consultation", () => {
  assert.match(
    source,
    /sessionStorage\.setItem\(ORDER_SUBMISSION_STATE_KEY, "confirmed"\)/
  );
  assert.match(
    source,
    /disabled=\{submitting \|\| submissionState !== "idle"\}/
  );
  assert.match(source, /function startAnotherConsultation\(\)/);
  assert.match(source, /sessionStorage\.removeItem\(ORDER_SUBMISSION_STATE_KEY\)/);
  assert.match(source, /href="\/customer-app\/mypage"/);
});

test("screen differentiates unknown result and confirmed order", () => {
  assert.match(source, /submissionState === "uncertain"\s*\?/);
  assert.match(source, /submissionState === "confirmed"\s*\?/);
  assert.match(source, /role="alert"/);
  assert.match(source, /二重注文を防ぐため再送を停止/);
});
