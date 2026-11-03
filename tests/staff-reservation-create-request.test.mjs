import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/staff-reservation-create-request.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { AbortController, clearTimeout, exports, setTimeout }
);

const {
  STAFF_RESERVATION_CREATE_REQUEST_TIMEOUT_MS,
  requestStaffReservationCreationWithTimeout,
} = exports;

test("staff reservation creation stops waiting while preserving its operation ID", async () => {
  let requestUrl;
  let requestOptions;
  const neverResponds = (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(new Error("request aborted"));
      });
    });
  };

  await assert.rejects(
    requestStaffReservationCreationWithTimeout(
      {
        operationId: "33333333-3333-4333-8333-333333333333",
        staffId: "staff-1",
      },
      neverResponds,
      5
    ),
    /request aborted/
  );

  assert.equal(requestUrl, "/api/reservations/staff-create");
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.signal.aborted, true);
  assert.deepEqual(JSON.parse(requestOptions.body), {
    operationId: "33333333-3333-4333-8333-333333333333",
    staffId: "staff-1",
  });
  assert.equal(STAFF_RESERVATION_CREATE_REQUEST_TIMEOUT_MS, 15_000);
});
