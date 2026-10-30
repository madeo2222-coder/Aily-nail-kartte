import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(
  new URL("../app/api/reservations/route.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../app/customer-app/reserve/page.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261030050000_idempotent_customer_reservation_requests.sql",
    import.meta.url,
  ),
  "utf8",
);

test("customer booking page persists one operation ID until a known result", () => {
  assert.match(page, /buildCustomerReservationFingerprint\(submission\)/);
  assert.match(
    page,
    /getOrCreateCustomerReservationOperationId\([\s\S]{0,180}crypto\.randomUUID\(\)/,
  );
  assert.match(page, /JSON\.stringify\(\{ \.\.\.submission, operationId \}\)/);
  assert.match(
    page,
    /if \(!json\)[\s\S]{0,300}setReservationResultUnknown\(true\)/,
  );
  assert.match(
    page,
    /if \(!response\.ok \|\| !json\.ok\)[\s\S]{0,500}clearCustomerReservationOperation/,
  );
});

test("customer booking API uses the idempotent RPC with a safe legacy fallback", () => {
  assert.match(api, /create_customer_requested_reservation_idempotent/);
  assert.match(api, /p_operation_id: operationId/);
  assert.match(api, /isMissingIdempotentCreateRpc\(error\)/);
  assert.match(api, /create_customer_requested_reservation",/);
  assert.match(api, /\["created", "already_created"\]/);
  assert.match(
    api,
    /excludeReservationId: requestedOperationId \|\| undefined/,
  );
  assert.match(
    api,
    /sendReservationNoticeMail\(\{[\s\S]{0,100}reservationId/,
  );
  assert.match(
    api,
    /alreadyCreated: writeResult\.outcome === "already_created" \|\| undefined/,
  );
});

test("customer booking notification retries reuse provider idempotency keys", () => {
  assert.match(
    api,
    /"Idempotency-Key": `customer-reservation-request-\$\{reservationId\}`/,
  );
  assert.match(
    api,
    /"X-Line-Retry-Key": createReservationNoticeLineRetryKey\(reservationId\)/,
  );
  assert.match(
    api,
    /createHash\("sha256"\)[\s\S]{0,180}customer-reservation-request/,
  );
});

test("idempotent customer booking RPC serializes writes and stays service-role-only", () => {
  assert.match(migration, /lock table public\.reservations in share row exclusive mode/);
  assert.match(migration, /where reservation\.id = p_operation_id/);
  assert.match(migration, /select 'already_created'::text/);
  assert.match(migration, /select 'idempotency_conflict'::text/);
  assert.match(migration, /reservation\.customer_id = p_customer_id/);
  assert.match(migration, /select 'customer_unavailable'::text/);
  assert.match(migration, /values \([\s\S]*p_operation_id/);
  assert.match(
    migration,
    /revoke all on function public\.create_customer_requested_reservation_idempotent\([\s\S]*\) from anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_customer_requested_reservation_idempotent\([\s\S]*\) to service_role/,
  );
});
