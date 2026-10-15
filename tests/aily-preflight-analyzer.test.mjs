import assert from "node:assert/strict";
import test from "node:test";

import {
  MIGRATIONS,
  analyzePreflight,
  formatReport,
  parsePreflight,
} from "../scripts/analyze-aily-preflight.mjs";

function rowsForState(stateByMigration) {
  const sources = {
    alternative: [
      { section: "prerequisite", check_name: "reservations.id", result: "PASS", detail: "uuid" },
    ],
    confirmation: [
      { section: "prerequisite", check_name: "reservations.id", result: "PASS", detail: "uuid" },
    ],
  };

  for (const migration of MIGRATIONS) {
    const state = stateByMigration[migration.id];
    for (const key of migration.checks) {
      const [section, check_name] = key.split("\u0000");
      const result = state === "missing"
        ? "MISSING"
        : migration.presentMarkers.get(key) || "PASS";
      sources[migration.source].push({ section, check_name, result, detail: "test" });
    }
  }

  return sources;
}

test("lists only the missing dependency suffix in order", () => {
  const sources = rowsForState({
    "20261003120111": "present",
    "20261004030707": "present",
    "20261004055916": "missing",
    "20261004070432": "missing",
  });
  const analysis = analyzePreflight(sources);

  assert.deepEqual(
    analysis.candidates.map((migration) => migration.id),
    ["20261004055916", "20261004070432"]
  );
  assert.deepEqual(analysis.blockers, []);
});

test("does not recommend reapplying migrations when every check is present", () => {
  const sources = rowsForState(Object.fromEntries(MIGRATIONS.map(({ id }) => [id, "present"])));
  const analysis = analyzePreflight(sources);

  assert.deepEqual(analysis.candidates, []);
  assert.deepEqual(analysis.blockers, []);
  assert.match(formatReport(analysis), /migrationを再実行しません/);
});

test("blocks a partial or unsafe object instead of hiding it as missing", () => {
  const sources = rowsForState(Object.fromEntries(MIGRATIONS.map(({ id }) => [id, "present"])));
  const target = sources.confirmation.find(
    (row) => row.check_name.endsWith(":execute:authenticated")
  );
  target.result = "FAIL";
  const analysis = analyzePreflight(sources);

  assert.deepEqual(analysis.candidates, []);
  assert.ok(analysis.blockers.some((blocker) => blocker.includes("20261004070432")));
});

test("blocks an inconsistent dependency state", () => {
  const sources = rowsForState({
    "20261003120111": "present",
    "20261004030707": "missing",
    "20261004055916": "present",
    "20261004070432": "present",
  });
  const analysis = analyzePreflight(sources);

  assert.deepEqual(analysis.candidates, []);
  assert.ok(analysis.blockers.some((blocker) => blocker.includes("依存順序")));
});

test("blocks missing prerequisites", () => {
  const sources = rowsForState(Object.fromEntries(MIGRATIONS.map(({ id }) => [id, "missing"])));
  sources.alternative[0].result = "MISSING";
  const analysis = analyzePreflight(sources);

  assert.deepEqual(analysis.candidates, []);
  assert.ok(analysis.blockers.some((blocker) => blocker.includes("prerequisite")));
});

test("parses Supabase CSV exports including quoted details", () => {
  const rows = parsePreflight(
    'section,check_name,result,detail\r\nprerequisite,reservations.id,PASS,"uuid, required"\r\n',
    "result.csv"
  );

  assert.deepEqual(rows, [
    {
      section: "prerequisite",
      check_name: "reservations.id",
      result: "PASS",
      detail: "uuid, required",
    },
  ]);
});
