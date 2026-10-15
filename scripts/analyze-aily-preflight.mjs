#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FUNCTION_SUFFIXES = [
  "body",
  "invoker",
  "search_path",
  "execute:anon",
  "execute:authenticated",
  "execute:service_role",
  "execute:PUBLIC",
];

function functionChecks(signature) {
  return FUNCTION_SUFFIXES.map((suffix) => `function\u0000${signature}:${suffix}`);
}

export const MIGRATIONS = [
  {
    id: "20261003120111",
    file: "20261003120111_reservation_alternative_requests.sql",
    source: "alternative",
    checks: [
      "ledger\u0000table",
      "ledger\u0000RLS",
      "ledger\u0000table_access:anon",
      "ledger\u0000table_access:authenticated",
      "ledger\u0000table_access:service_role",
      "ledger\u0000table_access:PUBLIC",
      ...functionChecks(
        "public.claim_reservation_alternative_request(uuid,uuid,uuid,uuid,text)"
      ),
      ...functionChecks(
        "public.complete_reservation_alternative_request(uuid,integer,text,text)"
      ),
    ],
    presentMarkers: new Map([["ledger\u0000table", "PRESENT"]]),
  },
  {
    id: "20261004030707",
    file: "20261004030707_prevent_customer_reservation_races.sql",
    source: "alternative",
    checks: [
      ...functionChecks(
        "public.create_customer_requested_reservation(uuid,uuid,uuid,text,timestamptz,timestamptz,text)"
      ),
      ...functionChecks(
        "public.update_customer_requested_reservation(uuid,uuid,timestamptz,timestamptz,uuid,text,timestamptz,timestamptz,text)"
      ),
      ...functionChecks(
        "public.cancel_customer_requested_reservation(uuid,uuid)"
      ),
    ],
    presentMarkers: new Map(),
  },
  {
    id: "20261004055916",
    file: "20261004055916_prevent_staff_confirmation_races.sql",
    source: "alternative",
    checks: functionChecks(
      "public.confirm_staff_reservation(uuid,uuid,timestamptz,timestamptz,uuid,uuid,text,timestamptz,timestamptz,text)"
    ),
    presentMarkers: new Map(),
  },
  {
    id: "20261004070432",
    file: "20261004070432_reservation_confirmation_deliveries.sql",
    source: "confirmation",
    checks: [
      "delivery_ledger\u0000table",
      "delivery_ledger\u0000RLS",
      "delivery_ledger\u0000table_access:anon",
      "delivery_ledger\u0000table_access:authenticated",
      "delivery_ledger\u0000table_access:service_role",
      "delivery_ledger\u0000table_access:PUBLIC",
      ...functionChecks(
        "public.claim_reservation_confirmation_delivery(uuid,uuid,uuid,uuid,text)"
      ),
      ...functionChecks(
        "public.complete_reservation_confirmation_delivery(uuid,integer,text,text)"
      ),
    ],
    presentMarkers: new Map([["delivery_ledger\u0000table", "PRESENT"]]),
  },
];

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSVの引用符が閉じられていません");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((values) => values.some((value) => value !== ""));
  if (nonEmptyRows.length < 2) throw new Error("CSVに結果行がありません");

  const headers = nonEmptyRows[0].map((header) => header.trim());
  return nonEmptyRows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
}

export function parsePreflight(text, filename = "result") {
  const trimmed = text.trim();
  let rows;

  if (filename.toLowerCase().endsWith(".json") || trimmed.startsWith("[")) {
    rows = JSON.parse(trimmed);
    if (!Array.isArray(rows)) throw new Error("JSONは結果行の配列にしてください");
  } else {
    rows = parseCsvRows(text);
  }

  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`${index + 1}行目が結果オブジェクトではありません`);
    }
    const normalized = {
      section: String(row.section ?? "").trim(),
      check_name: String(row.check_name ?? "").trim(),
      result: String(row.result ?? "").trim().toUpperCase(),
      detail: String(row.detail ?? "").trim(),
    };
    if (!normalized.section || !normalized.check_name || !normalized.result) {
      throw new Error(`${index + 1}行目にsection/check_name/resultがありません`);
    }
    return normalized;
  });
}

function indexRows(rows, source) {
  const indexed = new Map();
  for (const row of rows) {
    const key = `${row.section}\u0000${row.check_name}`;
    if (indexed.has(key)) {
      throw new Error(`${source}結果に重複した検査があります: ${row.section}/${row.check_name}`);
    }
    indexed.set(key, row);
  }
  return indexed;
}

function migrationState(migration, index) {
  const missingChecks = migration.checks.filter((key) => !index.has(key));
  if (missingChecks.length) {
    return {
      state: "review",
      reasons: missingChecks.map((key) => `結果にありません: ${key.replace("\u0000", "/")}`),
    };
  }

  const results = migration.checks.map((key) => [key, index.get(key).result]);
  if (results.every(([, result]) => result === "MISSING")) {
    return { state: "missing", reasons: [] };
  }

  const unexpected = results.filter(([key, result]) => {
    const expected = migration.presentMarkers.get(key) || "PASS";
    return result !== expected;
  });
  if (!unexpected.length) return { state: "present", reasons: [] };

  return {
    state: "review",
    reasons: unexpected.map(
      ([key, result]) => `${key.replace("\u0000", "/")}: ${result}`
    ),
  };
}

export function analyzePreflight({ alternative, confirmation }) {
  const sources = { alternative, confirmation };
  const indexes = {
    alternative: indexRows(alternative, "alternative"),
    confirmation: indexRows(confirmation, "confirmation"),
  };
  const blockers = [];

  for (const [source, rows] of Object.entries(sources)) {
    const prerequisites = rows.filter((row) => row.section === "prerequisite");
    if (!prerequisites.length) {
      blockers.push(`${source}: prerequisite結果がありません`);
      continue;
    }
    for (const row of prerequisites) {
      if (row.result !== "PASS") {
        blockers.push(
          `${source}: prerequisite/${row.check_name}=${row.result} (${row.detail})`
        );
      }
    }
  }

  const migrations = MIGRATIONS.map((migration) => ({
    ...migration,
    ...migrationState(migration, indexes[migration.source]),
  }));

  for (const migration of migrations) {
    if (migration.state === "review") {
      blockers.push(
        `${migration.id}: ${migration.reasons.join("; ")}`
      );
    }
  }

  let seenMissing = false;
  for (const migration of migrations) {
    if (migration.state === "missing") seenMissing = true;
    if (seenMissing && migration.state === "present") {
      blockers.push(
        `${migration.id}: 依存順序の前段がMISSINGなのに後段がPRESENTです`
      );
    }
  }

  return {
    migrations: migrations.map(({ id, file, state, reasons }) => ({
      id,
      file,
      state,
      reasons,
    })),
    candidates: blockers.length
      ? []
      : migrations.filter((migration) => migration.state === "missing")
          .map(({ id, file }) => ({ id, file })),
    blockers,
  };
}

export function formatReport(analysis) {
  const lines = ["# Aily Supabase preflight判定", ""];
  for (const migration of analysis.migrations) {
    lines.push(`- ${migration.id}: ${migration.state.toUpperCase()} — ${migration.file}`);
  }
  lines.push("");

  if (analysis.blockers.length) {
    lines.push("判定: 要確認（migrationは適用しないでください）", "");
    lines.push(...analysis.blockers.map((blocker) => `- ${blocker}`));
  } else if (analysis.candidates.length) {
    lines.push("判定: 次のmigrationが適用候補です（本番DB承認前には実行しません）", "");
    lines.push(...analysis.candidates.map((candidate) => `- ${candidate.id}: ${candidate.file}`));
  } else {
    lines.push("判定: 今回確認した4件はPRESENTです。migrationを再実行しません。");
  }

  return `${lines.join("\n")}\n`;
}

function getArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    values.set(argv[index], argv[index + 1]);
  }
  const alternative = values.get("--alternative");
  const confirmation = values.get("--confirmation");
  if (!alternative || !confirmation) {
    throw new Error(
      "Usage: node scripts/analyze-aily-preflight.mjs --alternative <csv|json> --confirmation <csv|json>"
    );
  }
  return { alternative, confirmation };
}

async function main() {
  const paths = getArguments(process.argv.slice(2));
  const [alternativeText, confirmationText] = await Promise.all([
    readFile(paths.alternative, "utf8"),
    readFile(paths.confirmation, "utf8"),
  ]);
  const analysis = analyzePreflight({
    alternative: parsePreflight(alternativeText, paths.alternative),
    confirmation: parsePreflight(confirmationText, paths.confirmation),
  });
  process.stdout.write(formatReport(analysis));
  if (analysis.blockers.length) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
