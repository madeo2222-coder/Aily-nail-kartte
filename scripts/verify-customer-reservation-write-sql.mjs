import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { PGlite } = await import(
  process.env.AILY_PGLITE_MODULE || "@electric-sql/pglite"
);
const root = fileURLToPath(new URL("../", import.meta.url));
const alternativeMigration = await readFile(
  `${root}/supabase/migrations/20261003120111_reservation_alternative_requests.sql`,
  "utf8"
);
const writeMigration = await readFile(
  `${root}/supabase/migrations/20261004030707_prevent_customer_reservation_races.sql`,
  "utf8"
);
const staffConfirmationMigration = await readFile(
  `${root}/supabase/migrations/20261004055916_prevent_staff_confirmation_races.sql`,
  "utf8"
);
const confirmationDeliveryMigration = await readFile(
  `${root}/supabase/migrations/20261004070432_reservation_confirmation_deliveries.sql`,
  "utf8"
);
const normalizedStatusMigration = await readFile(
  `${root}/supabase/migrations/20261026200835_normalize_customer_requested_statuses.sql`,
  "utf8"
);
const idempotentCreateMigration = await readFile(
  `${root}/supabase/migrations/20261030050000_idempotent_customer_reservation_requests.sql`,
  "utf8"
);
const normalizedStatusPreflight = await readFile(
  `${root}/scripts/sql/aily-customer-requested-status-preflight.sql`,
  "utf8"
);
const db = new PGlite();

await db.exec(`
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.salons(id uuid PRIMARY KEY);
CREATE TABLE public.customers(id uuid PRIMARY KEY, salon_id uuid);
CREATE TABLE public.staffs(
  id uuid PRIMARY KEY,
  salon_id uuid,
  is_active boolean,
  role text,
  customer_booking_enabled boolean
);
CREATE TABLE public.reservations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  salon_id uuid,
  staff_id uuid,
  status text,
  menu text,
  memo text,
  source text,
  start_at timestamptz,
  end_at timestamptz
);
CREATE TABLE public.external_calendar_blocks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid,
  staff_id uuid,
  start_at timestamptz,
  end_at timestamptz
);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
`);

await db.exec(alternativeMigration);
await db.exec(writeMigration);
await db.exec(staffConfirmationMigration);
await db.exec(confirmationDeliveryMigration);
await db.exec(normalizedStatusMigration);
await db.exec(idempotentCreateMigration);

const preflight = (await db.query(normalizedStatusPreflight)).rows[0];
assert.equal(preflight.create_rpc_exists, true);
assert.equal(preflight.update_rpc_exists, true);
assert.equal(preflight.cancel_rpc_exists, true);
assert.equal(preflight.normalization_helper_exists, true);
assert.equal(preflight.confirm_rpc_exists, true);
assert.equal(preflight.alternative_claim_rpc_exists, true);
assert.equal(preflight.confirmation_delivery_claim_rpc_exists, true);
assert.equal(preflight.service_role_can_create, true);
assert.equal(preflight.service_role_can_update, true);
assert.equal(preflight.service_role_can_cancel, true);
assert.equal(preflight.service_role_can_confirm, true);
assert.equal(preflight.service_role_can_claim_alternative, true);
assert.equal(preflight.service_role_can_claim_confirmation_delivery, true);

await db.exec(`
INSERT INTO public.salons VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.customers VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001'
);
INSERT INTO public.staffs VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  true,
  'staff',
  true
);
INSERT INTO public.staffs VALUES (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  true,
  'staff',
  true
);
SET ROLE service_role;
`);

const createIdempotentReservation = async ({
  operationId = "10000000-0000-4000-8000-000000000001",
  staffId = "00000000-0000-0000-0000-000000000003",
  menu = "マグネット",
  startAt = "2026-10-09T01:00:00.000Z",
  endAt = "2026-10-09T02:30:00.000Z",
  memo = "再試行確認",
} = {}) =>
  (
    await db.query(
      `SELECT * FROM public.create_customer_requested_reservation_idempotent(
        $1,
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        $2, $3, $4, $5, $6
      )`,
      [operationId, staffId, menu, startAt, endAt, memo]
    )
  ).rows[0];

const idempotentCreated = await createIdempotentReservation();
assert.equal(idempotentCreated.outcome, "created");
assert.equal(
  idempotentCreated.reservation_id,
  "10000000-0000-4000-8000-000000000001"
);

const idempotentRetry = await createIdempotentReservation();
assert.equal(idempotentRetry.outcome, "already_created");
assert.equal(idempotentRetry.reservation_id, idempotentCreated.reservation_id);

const operationConflict = await createIdempotentReservation({
  menu: "異なるメニュー",
});
assert.equal(operationConflict.outcome, "idempotency_conflict");
assert.equal(operationConflict.reservation_id, null);

const samePayloadNewOperation = await createIdempotentReservation({
  operationId: "10000000-0000-4000-8000-000000000002",
});
assert.equal(samePayloadNewOperation.outcome, "already_created");
assert.equal(
  samePayloadNewOperation.reservation_id,
  idempotentCreated.reservation_id
);

const customerOverlap = await createIdempotentReservation({
  operationId: "10000000-0000-4000-8000-000000000003",
  staffId: "00000000-0000-0000-0000-000000000004",
  menu: "別メニュー",
});
assert.equal(customerOverlap.outcome, "customer_unavailable");
assert.equal(customerOverlap.reservation_id, null);

const createReservation = async (startAt, endAt) =>
  (
    await db.query(
      `SELECT * FROM public.create_customer_requested_reservation(
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        'ジェル', $1, $2, '希望メモ'
      )`,
      [startAt, endAt]
    )
  ).rows[0];

const created = await createReservation(
  "2026-10-10T01:00:00.000Z",
  "2026-10-10T02:30:00.000Z"
);
assert.equal(created.outcome, "created");
assert.ok(created.reservation_id);

const duplicate = await createReservation(
  "2026-10-10T01:30:00.000Z",
  "2026-10-10T03:00:00.000Z"
);
assert.equal(duplicate.outcome, "slot_unavailable");
assert.equal(duplicate.reservation_id, null);

const updateReservation = async ({
  expectedStart = "2026-10-10T01:00:00.000Z",
  expectedEnd = "2026-10-10T02:30:00.000Z",
  startAt = "2026-10-11T01:00:00.000Z",
  endAt = "2026-10-11T02:30:00.000Z",
} = {}) =>
  (
    await db.query(
      `SELECT * FROM public.update_customer_requested_reservation(
        $1,
        '00000000-0000-0000-0000-000000000002',
        $2, $3,
        '00000000-0000-0000-0000-000000000003',
        'ジェル変更', $4, $5, '別日時回答'
      )`,
      [created.reservation_id, expectedStart, expectedEnd, startAt, endAt]
    )
  ).rows[0];

const updated = await updateReservation();
assert.equal(updated.outcome, "updated");
assert.equal(updated.reservation_id, created.reservation_id);

const stale = await updateReservation();
assert.equal(stale.outcome, "stale");
assert.equal(stale.reservation_id, null);

await db.exec(`
INSERT INTO public.external_calendar_blocks(salon_id, staff_id, start_at, end_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  '2026-10-12T01:00:00.000Z',
  '2026-10-12T03:00:00.000Z'
);
`);
const blocked = await updateReservation({
  expectedStart: "2026-10-11T01:00:00.000Z",
  expectedEnd: "2026-10-11T02:30:00.000Z",
  startAt: "2026-10-12T01:30:00.000Z",
  endAt: "2026-10-12T02:30:00.000Z",
});
assert.equal(blocked.outcome, "slot_unavailable");

await db.query(
  "UPDATE public.reservations SET status = $2 WHERE id = $1",
  [created.reservation_id, " ＲＥＱＵＥＳＴＥＤ "]
);
await db.exec(`
INSERT INTO public.reservations(
  customer_id, salon_id, staff_id, status, menu, memo, start_at, end_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  ' ＣＡＮＣＥＬＬＥＤ ',
  '取消済み予約',
  '',
  '2026-10-13T01:00:00.000Z',
  '2026-10-13T02:30:00.000Z'
);
`);
const legacyUpdated = await updateReservation({
  expectedStart: "2026-10-11T01:00:00.000Z",
  expectedEnd: "2026-10-11T02:30:00.000Z",
  startAt: "2026-10-13T01:00:00.000Z",
  endAt: "2026-10-13T02:30:00.000Z",
});
assert.equal(legacyUpdated.outcome, "updated");
assert.equal(legacyUpdated.reservation_id, created.reservation_id);

await db.query(
  "UPDATE public.reservations SET status = $2 WHERE id = $1",
  [created.reservation_id, " 予 約 申 請 中 "]
);

await db.exec(`
INSERT INTO public.reservation_alternative_requests(
  reservation_id, customer_id, salon_id, status, message
) VALUES (
  '${created.reservation_id}',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'sent',
  '別日時を入力してください'
);
`);

const cancelled = (
  await db.query(
    `SELECT * FROM public.cancel_customer_requested_reservation(
      $1, '00000000-0000-0000-0000-000000000002'
    )`,
    [created.reservation_id]
  )
).rows[0];
assert.equal(cancelled.outcome, "cancelled");
assert.equal(cancelled.reservation_id, created.reservation_id);
assert.equal(
  (
    await db.query(
      "SELECT status FROM public.reservation_alternative_requests WHERE reservation_id = $1",
      [created.reservation_id]
    )
  ).rows[0].status,
  "superseded"
);
assert.equal(
  (
    await db.query("SELECT status FROM public.reservations WHERE id = $1", [
      created.reservation_id,
    ])
  ).rows[0].status,
  "cancelled"
);
const recreatedOverLegacyCancelled = await createReservation(
  "2026-10-13T01:00:00.000Z",
  "2026-10-13T02:30:00.000Z"
);
assert.equal(recreatedOverLegacyCancelled.outcome, "created");
assert.ok(recreatedOverLegacyCancelled.reservation_id);
const repeatedCancel = (
  await db.query(
    `SELECT * FROM public.cancel_customer_requested_reservation(
      $1, '00000000-0000-0000-0000-000000000002'
    )`,
    [created.reservation_id]
  )
).rows[0];
assert.equal(repeatedCancel.outcome, "stale");

await db.exec("RESET ROLE; SET ROLE anon;");
await assert.rejects(
  () =>
    db.query(`SELECT * FROM public.create_customer_requested_reservation(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      'ジェル',
      '2026-10-13T01:00:00.000Z',
      '2026-10-13T02:30:00.000Z',
      ''
    )`),
  /permission denied/
);
await assert.rejects(
  () =>
    db.query(`SELECT * FROM public.create_customer_requested_reservation_idempotent(
      '10000000-0000-4000-8000-000000000004',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      'ジェル',
      '2026-10-14T01:00:00.000Z',
      '2026-10-14T02:30:00.000Z',
      ''
    )`),
  /permission denied/
);
await assert.rejects(
  () =>
    db.query(`SELECT * FROM public.cancel_customer_requested_reservation(
      '${created.reservation_id}',
      '00000000-0000-0000-0000-000000000002'
    )`),
  /permission denied/
);

await db.close();
console.log(
  "PASS: customer reservation create/update/cancel is atomic, normalized-status-aware, conflict-aware, stale-safe, and service-role-only"
);
