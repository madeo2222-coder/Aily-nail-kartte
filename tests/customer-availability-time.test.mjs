import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const reservationStatusExports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/reservation-status.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: reservationStatusExports, Set, String },
);

function load(now = "2026-10-18T03:15:00Z") {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return Date.parse(now); }
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/server/customerReservationAvailability.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    Date: FixedDate,
    Intl,
    require(name) {
      if (name === "@/lib/reservation-status") {
        return reservationStatusExports;
      }
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return exports;
}
function db({ reservations = [], blocks = [], error = false, filters = [] } = {}) {
  return { from(table) {
    const query = { then(resolve) { return Promise.resolve({ data: table === "staffs" ? [{ id: "staff-1", name: "Fixture" }] : table === "reservations" ? reservations : blocks, error: error ? {} : null }).then(resolve); } };
    for (const name of ["select", "eq", "lt", "gt", "neq", "order"]) query[name] = (...args) => {
      filters.push([table, name, ...args]);
      return query;
    };
    return query;
  } };
}
const times = async (module, supabase, date = "2026-10-18") => (await module.getCustomerReservationAvailability({ supabase, salonId: "salon-1", date, durationMinutes: 60 })).slots.map(s => s.time);
test("today excludes elapsed slots, tomorrow preserves opening time", async () => {
  const api = load();
  const today = await times(api, db());
  assert.equal(today[0], "12:30");
  assert.equal((await times(api, db(), "2026-10-19"))[0], "10:00");
});
test("timestamps with Z, +00:00, and +09:00 block the same interval", async () => {
  const api = load("2026-10-17T20:00:00Z");
  for (const [start_at, end_at] of [
    ["2026-10-18T01:00:00Z", "2026-10-18T02:00:00Z"],
    ["2026-10-18T01:00:00+00:00", "2026-10-18T02:00:00+00:00"],
    ["2026-10-18T10:00:00+09:00", "2026-10-18T11:00:00+09:00"],
  ]) {
    const slots = await times(api, db({ reservations: [{ staff_id: "staff-1", status: "confirmed", start_at, end_at }] }));
    assert.ok(!slots.includes("10:00") && !slots.includes("10:30"));
    assert.ok(slots.includes("11:00"));
  }
});
test("unassigned blocks exclude all staff; every supported cancelled status does not", async () => {
  const api = load("2026-10-17T20:00:00Z");
  const interval = { staff_id: null, start_at: "2026-10-18T10:00:00+09:00", end_at: "2026-10-18T11:00:00+09:00" };
  assert.equal((await times(api, db({ blocks: [interval] })))[0], "11:00");
  for (const status of ["キャンセル", "cancelled", "canceled", "cancel", "取消", "取り消し", " CANCELLED "]) {
    assert.equal(
      (await times(api, db({ reservations: [{ ...interval, status }] })))[0],
      "10:00",
      status
    );
  }
  assert.equal(
    (await times(api, db({ reservations: [{ ...interval, status: "confirmed" }] })))[0],
    "11:00"
  );
});
test("invalid dates, leap-day rollovers and out-of-range dates are rejected", () => {
  const api = load("2026-02-20T00:00:00Z");
  for (const date of ["2026-02-29", "2026-02-30", "2026-02-19", "2026-03-23", "bad"]) assert.equal(api.isValidCustomerBookingDate(date), false, date);
  assert.equal(api.isValidCustomerBookingDate("2026-03-22"), true);
  assert.equal(load("2028-02-20T00:00:00Z").isValidCustomerBookingDate("2028-02-29"), true);
  assert.equal(api.addDaysText("2026-12-31", 1), "2027-01-01");
});
test("invalid busy intervals and failed reads never report available slots", async () => {
  for (const interval of [
    { start_at: null, end_at: null },
    { start_at: "bad", end_at: "bad" },
    { start_at: "2026-10-18T10:00:00+09:00", end_at: "2026-10-18T09:00:00+09:00" },
  ]) await assert.rejects(times(load(), db({ blocks: [interval] })), /Invalid busy/);
  await assert.rejects(times(load(), db({ error: true })), /lookup failed/);
});
test("editing availability excludes only the reservation being changed", async () => {
  const api = load("2026-10-17T20:00:00Z");
  const filters = [];
  await api.getCustomerReservationAvailability({
    supabase: db({ filters }),
    salonId: "salon-1",
    date: "2026-10-18",
    durationMinutes: 60,
    excludeReservationId: "reservation-current",
  });
  assert.deepEqual(
    filters.filter(([table, operation]) => table === "reservations" && operation === "neq"),
    [["reservations", "neq", "id", "reservation-current"]]
  );
});
