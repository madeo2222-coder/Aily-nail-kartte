import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261026200835_normalize_customer_requested_statuses.sql",
    import.meta.url,
  ),
  "utf8",
);
const verifier = readFileSync(
  new URL("../scripts/verify-customer-reservation-write-sql.mjs", import.meta.url),
  "utf8",
);

test("customer requested-status migration normalizes all guarded RPC writes", () => {
  assert.match(
    migration,
    /create or replace function public\.normalize_reservation_workflow_status/,
  );
  assert.match(
    migration,
    /translate\([\s\S]*ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ[\s\S]*ABCDEFGHIJKLMNOPQRSTUVWXYZ/,
  );
  assert.match(migration, /\[\[:space:\]　\]\+/);

  for (const functionName of [
    "create_customer_requested_reservation",
    "update_customer_requested_reservation",
    "cancel_customer_requested_reservation",
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${functionName}`),
    );
  }

  assert.ok(
    migration.match(/normalize_reservation_workflow_status\(v_reservation\.status\)/g)
      ?.length >= 2,
  );
  assert.ok(
    migration.match(/normalize_reservation_workflow_status\(reservation\.status\)/g)
      ?.length >= 3,
  );
});

test("normalization helper and all customer write RPCs remain service-role-only", () => {
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.normalize_reservation_workflow_status\\(text\\) from ${role}`,
      ),
    );
  }
  assert.match(
    migration,
    /grant execute on function public\.normalize_reservation_workflow_status\(text\) to service_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.create_customer_requested_reservation\([\s\S]*from anon/,
  );
  assert.match(
    migration,
    /revoke all on function public\.update_customer_requested_reservation\([\s\S]*from anon/,
  );
  assert.match(
    migration,
    /revoke all on function public\.cancel_customer_requested_reservation\(uuid, uuid\) from anon/,
  );
});

test("PGlite verification covers full-width requested, spaced Japanese, and cancelled overlap", () => {
  assert.match(verifier, /ＲＥＱＵＥＳＴＥＤ/);
  assert.match(verifier, /予 約 申 請 中/);
  assert.match(verifier, /ＣＡＮＣＥＬＬＥＤ/);
  assert.match(verifier, /recreatedOverLegacyCancelled\.outcome, "created"/);
  assert.match(verifier, /assert\.equal\(legacyUpdated\.outcome, "updated"\)/);
});
