import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadRequestModule() {
  const exports = {};
  const timers = [];
  const cleared = [];

  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../lib/reservation-staff-read-request.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      AbortController,
      clearTimeout(id) {
        cleared.push(id);
      },
      exports,
      setTimeout(callback, milliseconds) {
        const id = timers.length + 1;
        timers.push({ callback, id, milliseconds });
        return id;
      },
    },
  );

  return { cleared, exports, timers };
}

test("reservation staff reads stop waiting after 15 seconds", async () => {
  const { cleared, exports, timers } = loadRequestModule();
  let requestSignal;

  const pending = exports.requestReservationStaffReadWithTimeout(
    "/api/reservations/list-data",
    (_path, init) => {
      requestSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    },
  );

  assert.equal(timers[0].milliseconds, 15_000);
  assert.equal(requestSignal.aborted, false);
  timers[0].callback();
  await assert.rejects(pending, /aborted/);
  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(cleared, [timers[0].id]);
});

test("reservation list and calendar use the bounded read request", () => {
  const listSource = readFileSync(
    new URL("../app/reservations/ReservationsPageClient.tsx", import.meta.url),
    "utf8",
  );
  const calendarSource = readFileSync(
    new URL("../app/reservations/calendar/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    listSource,
    /requestReservationStaffReadWithTimeout\([\s\S]{0,100}"\/api\/reservations\/list-data"/,
  );
  assert.match(
    calendarSource,
    /requestReservationStaffReadWithTimeout\([\s\S]{0,100}"\/api\/reservations\/calendar-data"/,
  );
});
