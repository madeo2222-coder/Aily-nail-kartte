import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MIGRATIONS,
  PREREQUISITES,
  analyzePreflight,
  formatReport,
  parsePreflight,
} from "../scripts/analyze-aily-preflight.mjs";

function rowsForState(stateByMigration) {
  const sources = Object.fromEntries(Object.entries(PREREQUISITES).map(([source, names]) => [
    source,
    names.map((check_name) => ({ section: "prerequisite", check_name, result: "PASS", detail: "test" })),
  ]));

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

test("does not accept a single PASS prerequisite as a complete export", () => {
  const sources = rowsForState(Object.fromEntries(MIGRATIONS.map(({ id }) => [id, "missing"])));
  for (const source of Object.keys(sources)) {
    sources[source] = sources[source].filter((row) =>
      row.section !== "prerequisite" || row.check_name === "reservations.id"
    );
  }
  const analysis = analyzePreflight(sources);
  assert.deepEqual(analysis.candidates, []);
  assert.ok(analysis.blockers.some((blocker) => blocker.includes("prerequisite")));
});

test("each omitted prerequisite blocks both migration candidates and a ready report", () => {
  for (const state of ["present", "missing"]) {
    for (const [source, names] of Object.entries(PREREQUISITES)) {
      for (const name of names) {
        const sources = rowsForState(Object.fromEntries(MIGRATIONS.map(({ id }) => [id, state])));
        sources[source] = sources[source].filter((row) =>
          !(row.section === "prerequisite" && row.check_name === name)
        );
        const analysis = analyzePreflight(sources);
        assert.deepEqual(analysis.candidates, []);
        assert.ok(analysis.blockers.some((blocker) => blocker.includes(`${source}: prerequisite/${name}が結果にありません`)));
        assert.match(formatReport(analysis), /要確認/);
        assert.doesNotMatch(formatReport(analysis), /判定: 今回確認した4件はPRESENT/);
      }
    }
  }
});

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.AILY_PGLITE_MODULE || "@electric-sql/pglite"));
} catch (error) {
  if (process.env.AILY_PGLITE_MODULE) throw error;
}

test("prerequisite manifest matches every row emitted by the real read-only SQL", {
  skip: PGlite ? false : "PGlite is not installed in the application workspace",
}, async () => {
  const db = new PGlite();
  try {
    for (const [source, file] of Object.entries({
      alternative: "aily-alternative-request-preflight.sql",
      confirmation: "aily-confirmation-delivery-preflight.sql",
    })) {
      const sql = await readFile(new URL(`../scripts/sql/${file}`, import.meta.url), "utf8");
      const results = await db.exec(sql);
      const rows = results.find((result) => result.fields?.some((field) => field.name === "check_name")).rows;
      const names = rows.filter((row) => row.section === "prerequisite").map((row) => row.check_name);
      assert.deepEqual([...PREREQUISITES[source]].sort(), names.sort(), source);
    }
  } finally {
    await db.close();
  }
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
