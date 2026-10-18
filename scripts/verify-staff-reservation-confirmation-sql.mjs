import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { PGlite } = await import(
  process.env.AILY_PGLITE_MODULE || "@electric-sql/pglite"
);
const root = fileURLToPath(new URL("../", import.meta.url));
const confirmationDeliveryInspection = await readFile(
  `${root}/scripts/sql/aily-confirmation-delivery-preflight.sql`,
  "utf8"
);
const alternativeMigration = await readFile(
  `${root}/supabase/migrations/20261003120111_reservation_alternative_requests.sql`,
  "utf8"
);
const confirmationMigration = await readFile(
  `${root}/supabase/migrations/20261004055916_prevent_staff_confirmation_races.sql`,
  "utf8"
);
const confirmationDeliveryMigration = await readFile(
  `${root}/supabase/migrations/20261004070432_reservation_confirmation_deliveries.sql`,
  "utf8"
);
const db = new PGlite();
const inspectConfirmationDelivery = async () =>
  (await db.exec(confirmationDeliveryInspection)).find((result) =>
    result.fields?.some((field) => field.name === "check_name")
  ).rows;

let deliveryChecks = await inspectConfirmationDelivery();
assert.ok(deliveryChecks.every((row) => row.result === "MISSING"));
console.log(
  "PASS: confirmation delivery inspection handles a missing schema without customer data reads"
);

await db.exec(`
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.salons(id uuid PRIMARY KEY);
CREATE TABLE public.customers(
  id uuid PRIMARY KEY,
  salon_id uuid,
  line_user_id text
);
CREATE TABLE public.staffs(
  id uuid PRIMARY KEY,
  salon_id uuid,
  is_active boolean,
  role text
);
CREATE TABLE public.reservations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  salon_id uuid,
  staff_id uuid,
  status text,
  menu text,
  memo text,
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
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
`);

deliveryChecks = await inspectConfirmationDelivery();
assert.ok(
  deliveryChecks
    .filter((row) => row.section === "prerequisite")
    .every((row) => row.result === "PASS")
);
assert.ok(
  deliveryChecks
    .filter((row) => row.section !== "prerequisite")
    .every((row) => row.result === "MISSING")
);
console.log(
  "PASS: prerequisite-only schema is identified as a new confirmation-delivery migration candidate"
);

await db.exec(alternativeMigration);
await db.exec(confirmationMigration);
await db.exec(confirmationDeliveryMigration);

deliveryChecks = await inspectConfirmationDelivery();
assert.deepEqual(
  deliveryChecks.filter((row) => !["PASS", "PRESENT"].includes(row.result)),
  []
);
console.log(
  `PASS: migrated confirmation delivery schema passes all ${deliveryChecks.length} catalog checks`
);

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
  'staff'
);
INSERT INTO public.reservations(
  id, customer_id, salon_id, staff_id, status, menu, memo, start_at, end_at
) VALUES (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  'requested',
  'ジェル',
  '',
  '2026-10-10T01:00:00.000Z',
  '2026-10-10T02:30:00.000Z'
), (
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  'confirmed',
  '別予約',
  '',
  '2026-10-11T01:00:00.000Z',
  '2026-10-11T02:30:00.000Z'
);
SET ROLE service_role;
`);

const confirmReservation = async ({
  reservationId = "00000000-0000-0000-0000-000000000004",
  expectedStart = "2026-10-10T01:00:00.000Z",
  expectedEnd = "2026-10-10T02:30:00.000Z",
  startAt = "2026-10-11T01:30:00.000Z",
  endAt = "2026-10-11T03:00:00.000Z",
} = {}) =>
  (
    await db.query(
      `SELECT * FROM public.confirm_staff_reservation(
        $1,
        '00000000-0000-0000-0000-000000000001',
        $2, $3,
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        'ジェル変更', $4, $5, 'スタッフ確認'
      )`,
      [reservationId, expectedStart, expectedEnd, startAt, endAt]
    )
  ).rows[0];

const conflict = await confirmReservation();
assert.equal(conflict.outcome, "slot_unavailable");
assert.equal(conflict.reservation_id, null);

await db.exec(`
DELETE FROM public.reservations
WHERE id = '00000000-0000-0000-0000-000000000005';
INSERT INTO public.reservation_alternative_requests(
  reservation_id, customer_id, salon_id, status, message
) VALUES (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'sent',
  '別日時を入力してください'
);
`);

const confirmed = await confirmReservation({
  startAt: "2026-10-12T01:00:00.000Z",
  endAt: "2026-10-12T02:30:00.000Z",
});
assert.equal(confirmed.outcome, "confirmed");
assert.equal(
  confirmed.reservation_id,
  "00000000-0000-0000-0000-000000000004"
);
assert.deepEqual(
  (
    await db.query(
      "SELECT status, menu, start_at, end_at FROM public.reservations WHERE id = $1",
      [confirmed.reservation_id]
    )
  ).rows[0],
  {
    status: "confirmed",
    menu: "ジェル変更",
    start_at: new Date("2026-10-12T01:00:00.000Z"),
    end_at: new Date("2026-10-12T02:30:00.000Z"),
  }
);
assert.equal(
  (
    await db.query(
      "SELECT status FROM public.reservation_alternative_requests WHERE reservation_id = $1",
      [confirmed.reservation_id]
    )
  ).rows[0].status,
  "superseded"
);

const repeated = await confirmReservation();
assert.equal(repeated.outcome, "already_confirmed");
assert.equal(repeated.reservation_id, confirmed.reservation_id);

const firstDeliveryClaim = (
  await db.query(
    `SELECT * FROM public.claim_reservation_confirmation_delivery(
      $1,
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000003',
      '予約確定メッセージ'
    )`,
    [confirmed.reservation_id]
  )
).rows[0];
assert.equal(firstDeliveryClaim.claim_status, "claimed");
assert.equal(firstDeliveryClaim.attempt_count, 1);

assert.equal(
  (
    await db.query(
      `SELECT public.complete_reservation_confirmation_delivery($1, 1, 'failed', 'temporary') AS completed`,
      [confirmed.reservation_id]
    )
  ).rows[0].completed,
  true
);

const retryDeliveryClaim = (
  await db.query(
    `SELECT * FROM public.claim_reservation_confirmation_delivery(
      $1,
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000003',
      '予約確定メッセージ'
    )`,
    [confirmed.reservation_id]
  )
).rows[0];
assert.equal(retryDeliveryClaim.claim_status, "claimed");
assert.equal(retryDeliveryClaim.attempt_count, 2);
assert.equal(retryDeliveryClaim.line_retry_key, firstDeliveryClaim.line_retry_key);

assert.equal(
  (
    await db.query(
      `SELECT public.complete_reservation_confirmation_delivery($1, 2, 'sent', null) AS completed`,
      [confirmed.reservation_id]
    )
  ).rows[0].completed,
  true
);

const alreadySentClaim = (
  await db.query(
    `SELECT * FROM public.claim_reservation_confirmation_delivery(
      $1,
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000003',
      '予約確定メッセージ'
    )`,
    [confirmed.reservation_id]
  )
).rows[0];
assert.equal(alreadySentClaim.claim_status, "already_sent");
assert.equal(alreadySentClaim.attempt_count, 2);

await db.exec(`
INSERT INTO public.reservations(
  id, customer_id, salon_id, staff_id, status, menu, memo, start_at, end_at
) VALUES (
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  'requested',
  'ジェル',
  '',
  '2026-10-13T01:00:00.000Z',
  '2026-10-13T02:30:00.000Z'
);
UPDATE public.reservations
SET start_at = '2026-10-13T03:00:00.000Z', end_at = '2026-10-13T04:30:00.000Z'
WHERE id = '00000000-0000-0000-0000-000000000006';
`);
const stale = await confirmReservation({
  reservationId: "00000000-0000-0000-0000-000000000006",
  expectedStart: "2026-10-13T01:00:00.000Z",
  expectedEnd: "2026-10-13T02:30:00.000Z",
  startAt: "2026-10-13T01:00:00.000Z",
  endAt: "2026-10-13T02:30:00.000Z",
});
assert.equal(stale.outcome, "stale");

await db.exec("RESET ROLE; SET ROLE anon;");
await assert.rejects(
  () =>
    db.query(`SELECT * FROM public.confirm_staff_reservation(
      '00000000-0000-0000-0000-000000000006',
      '00000000-0000-0000-0000-000000000001',
      '2026-10-13T03:00:00.000Z',
      '2026-10-13T04:30:00.000Z',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      'ジェル',
      '2026-10-13T03:00:00.000Z',
      '2026-10-13T04:30:00.000Z',
      ''
    )`),
  /permission denied/
);
await assert.rejects(
  () => db.query("SELECT * FROM public.reservation_confirmation_deliveries"),
  /permission denied/
);
await assert.rejects(
  () =>
    db.query(`SELECT * FROM public.claim_reservation_confirmation_delivery(
      '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000003',
      '予約確定メッセージ'
    )`),
  /permission denied/
);

await db.exec("RESET ROLE; GRANT SELECT(message) ON public.reservation_confirmation_deliveries TO anon;");
deliveryChecks = await inspectConfirmationDelivery();
assert.equal(
  deliveryChecks.find((row) => row.check_name === "table_access:anon").result,
  "FAIL"
);
await db.exec(`
REVOKE SELECT(message) ON public.reservation_confirmation_deliveries FROM anon;
ALTER FUNCTION public.complete_reservation_confirmation_delivery(uuid,integer,text,text)
  SECURITY DEFINER;
`);
deliveryChecks = await inspectConfirmationDelivery();
assert.equal(
  deliveryChecks.find(
    (row) => row.check_name.includes("complete_") && row.check_name.endsWith(":invoker")
  ).result,
  "FAIL"
);
await db.exec(`
ALTER FUNCTION public.complete_reservation_confirmation_delivery(uuid,integer,text,text)
  SECURITY INVOKER;
CREATE OR REPLACE FUNCTION public.complete_reservation_confirmation_delivery(
  p_reservation_id uuid,
  p_attempt_count integer,
  p_status text,
  p_error text default null
)
RETURNS boolean LANGUAGE sql SET search_path = '' AS 'SELECT false';
REVOKE ALL ON FUNCTION public.complete_reservation_confirmation_delivery(uuid,integer,text,text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_reservation_confirmation_delivery(uuid,integer,text,text)
  TO service_role;
`);
deliveryChecks = await inspectConfirmationDelivery();
assert.equal(
  deliveryChecks.find(
    (row) => row.check_name.includes("complete_") && row.check_name.endsWith(":body")
  ).result,
  "REVIEW"
);
console.log(
  "PASS: unsafe column grants, SECURITY DEFINER, and unexpected RPC bodies are detected"
);

await db.close();
console.log(
  "PASS: staff confirmation and LINE delivery are salon-scoped, conflict-aware, retry-safe, idempotent, and service-role-only"
);
