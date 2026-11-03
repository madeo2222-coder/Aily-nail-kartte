import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/reservation-confirmation-request.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { AbortController, clearTimeout, exports, fetch, setTimeout }
);

const {
  RESERVATION_CONFIRMATION_REQUEST_TIMEOUT_MS,
  requestReservationConfirmationWithTimeout,
} = exports;

test("reservation confirmation stops waiting and preserves an unknown result", async () => {
  let requestSignal;
  let requestBody;
  const neverResponds = (_url, options) => {
    requestSignal = options.signal;
    requestBody = JSON.parse(options.body);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(new Error("request aborted"));
      });
    });
  };

  await assert.rejects(
    requestReservationConfirmationWithTimeout(
      "/api/reservations/reservation-1/confirm",
      {
        expectedCustomerId: "customer-1",
        expectedStatus: "requested",
      },
      neverResponds,
      5
    ),
    /request aborted/
  );

  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(requestBody, {
    expectedCustomerId: "customer-1",
    expectedStatus: "requested",
  });
  assert.equal(RESERVATION_CONFIRMATION_REQUEST_TIMEOUT_MS, 15_000);
});

test("both staff confirmation screens use the bounded confirmation request", () => {
  for (const path of [
    "../app/reservations/ReservationsPageClient.tsx",
    "../app/reservations/edit/[id]/page.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requestReservationConfirmationWithTimeout\(/);
    assert.match(source, /\/api\/reservations\/\$\{[^}]+\}\/confirm/);
  }
});
