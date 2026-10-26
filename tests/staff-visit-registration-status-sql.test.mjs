import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261027080000_normalize_staff_visit_reservation_status.sql",
    import.meta.url,
  ),
  "utf8",
);
const verifier = readFileSync(
  new URL(
    "../scripts/verify-staff-visit-registration-status-sql.mjs",
    import.meta.url,
  ),
  "utf8",
);
const preflight = readFileSync(
  new URL(
    "../scripts/sql/aily-staff-visit-registration-status-preflight.sql",
    import.meta.url,
  ),
  "utf8",
);

test("staff visit registration normalizes guarded reservation status checks", () => {
  assert.match(
    migration,
    /create or replace function public\.normalize_reservation_workflow_status/,
  );
  assert.match(
    migration,
    /create or replace function public\.register_staff_visit/,
  );
  assert.match(
    migration,
    /normalize_reservation_workflow_status\(v_reservation_status\) in \('完了', 'completed'\)/,
  );
  assert.match(
    migration,
    /normalize_reservation_workflow_status\(v_reservation_status\) not in \('confirmed', '予約確定'\)/,
  );
  assert.match(
    migration,
    /normalize_reservation_workflow_status\(reservation\.status\) in \('confirmed', '予約確定'\)/,
  );
});

test("staff visit registration and normalization helper remain service-role-only", () => {
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.normalize_reservation_workflow_status\\(text\\) from ${role}`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke execute on function public\\.register_staff_visit\\([\\s\\S]*?\\) from ${role}`,
      ),
    );
  }
  assert.match(
    migration,
    /grant execute on function public\.register_staff_visit\([\s\S]*?\) to service_role/,
  );
  assert.match(preflight, /anon_can_register_visit/);
  assert.match(preflight, /authenticated_can_register_visit/);
});

test("PGlite verifier covers legacy confirmed, completed, and unconfirmed reservations", () => {
  assert.match(verifier, /ＣＯＮＦＩＲＭＥＤ/);
  assert.match(verifier, /予 約 確 定/);
  assert.match(verifier, /ＣＯＭＰＬＥＴＥＤ/);
  assert.match(verifier, /VISIT_RESERVATION_ALREADY_COMPLETED/);
  assert.match(verifier, /VISIT_INVALID_RESERVATION/);
  assert.match(verifier, /permission denied/);
});
