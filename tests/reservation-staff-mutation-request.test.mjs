import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/reservation-staff-mutation-request.ts", import.meta.url),
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
  RESERVATION_STAFF_MUTATION_REQUEST_TIMEOUT_MS,
  requestReservationStaffMutationWithTimeout,
} = exports;

for (const method of ["POST", "PATCH", "DELETE"]) {
  test(`staff reservation ${method} stops waiting and preserves an unknown result`, async () => {
    let requestPath;
    let requestOptions;
    const neverResponds = (path, options) => {
      requestPath = path;
      requestOptions = options;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          reject(new Error("request aborted"));
        });
      });
    };

    await assert.rejects(
      requestReservationStaffMutationWithTimeout(
        "/api/reservations/reservation-1/staff-edit",
        method,
        { expectedStatus: "requested" },
        neverResponds,
        5
      ),
      /request aborted/
    );

    assert.equal(requestPath, "/api/reservations/reservation-1/staff-edit");
    assert.equal(requestOptions.method, method);
    assert.equal(requestOptions.signal.aborted, true);
    assert.deepEqual(JSON.parse(requestOptions.body), {
      expectedStatus: "requested",
    });
  });
}

test("staff reservation mutation uses the shared 15 second wait bound", () => {
  assert.equal(RESERVATION_STAFF_MUTATION_REQUEST_TIMEOUT_MS, 15_000);
});
