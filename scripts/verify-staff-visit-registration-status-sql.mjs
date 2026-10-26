import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { PGlite } = await import(
  process.env.AILY_PGLITE_MODULE || "@electric-sql/pglite"
);
const root = fileURLToPath(new URL("../", import.meta.url));
const migration = await readFile(
  `${root}/supabase/migrations/20261027080000_normalize_staff_visit_reservation_status.sql`,
  "utf8"
);
const preflightSql = await readFile(
  `${root}/scripts/sql/aily-staff-visit-registration-status-preflight.sql`,
  "utf8"
);
const db = new PGlite();

await db.exec(`
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.staffs(
  id uuid PRIMARY KEY,
  salon_id uuid,
  is_active boolean,
  role text,
  name text
);
CREATE TABLE public.customers(
  id uuid PRIMARY KEY,
  salon_id uuid,
  coupon_500_count integer DEFAULT 0,
  coupon_1000_count integer DEFAULT 0
);
CREATE TABLE public.reservations(
  id uuid PRIMARY KEY,
  customer_id uuid,
  salon_id uuid,
  staff_id uuid,
  status text
);
CREATE TABLE public.visits(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  salon_id uuid,
  reservation_id uuid,
  staff_id uuid,
  staff_name text,
  visit_date date,
  menu_name text,
  menu text,
  color text,
  price integer,
  payment_method text,
  payment_status text,
  paid_amount numeric,
  unpaid_amount numeric,
  memo text,
  next_visit_date date,
  next_proposal text
);
CREATE TABLE public.coupon_histories(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  visit_id uuid,
  coupon_type text,
  action text,
  amount integer,
  note text
);
CREATE TABLE public.visit_payments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid,
  payment_method text,
  amount numeric,
  sort_order integer
);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
`);

let preflight = (await db.query(preflightSql)).rows[0];
assert.equal(preflight.register_visit_rpc_exists, false);
assert.equal(preflight.normalization_helper_exists, false);
assert.equal(preflight.service_role_can_register_visit, null);
assert.equal(preflight.anon_can_register_visit, null);
assert.equal(preflight.authenticated_can_register_visit, null);

await db.exec(migration);
preflight = (await db.query(preflightSql)).rows[0];
assert.equal(preflight.register_visit_rpc_exists, true);
assert.equal(preflight.normalization_helper_exists, true);
assert.equal(preflight.service_role_can_register_visit, true);
assert.equal(preflight.anon_can_register_visit, false);
assert.equal(preflight.authenticated_can_register_visit, false);

await db.exec(`
INSERT INTO public.staffs(id, salon_id, is_active, role, name) VALUES
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', true, 'staff', '担当スタッフ'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', true, 'owner', '責任者');
INSERT INTO public.customers(id, salon_id) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');
INSERT INTO public.reservations(id, customer_id, salon_id, staff_id, status) VALUES
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', ' ＣＯＮＦＩＲＭＥＤ '),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', ' 予 約 確 定 '),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', ' ＣＯＭＰＬＥＴＥＤ '),
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'requested');
SET ROLE service_role;
`);

const register = async (reservationId) => (
  await db.query(
    `SELECT * FROM public.register_staff_visit(
      '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000001',
      $1,
      '00000000-0000-0000-0000-000000000002',
      null,
      '2026-10-27',
      'ジェル',
      '赤',
      5000,
      '来店メモ',
      null,
      '',
      '[{"method":"現金","amount":5000}]'::jsonb
    )`,
    [reservationId]
  )
).rows[0];

const fullWidth = await register("00000000-0000-0000-0000-000000000005");
assert.equal(fullWidth.reservation_id, "00000000-0000-0000-0000-000000000005");
assert.equal(fullWidth.staff_id, "00000000-0000-0000-0000-000000000003");
assert.equal(fullWidth.customer_id, "00000000-0000-0000-0000-000000000002");
assert.equal(fullWidth.price, 5000);
assert.equal(Number(fullWidth.paid_amount), 5000);
assert.equal(
  (await db.query("SELECT status FROM public.reservations WHERE id = $1", [fullWidth.reservation_id])).rows[0].status,
  "完了"
);
assert.equal(
  (await db.query("SELECT count(*)::integer AS count FROM public.visits WHERE reservation_id = $1", [fullWidth.reservation_id])).rows[0].count,
  1
);
assert.deepEqual(
  (await db.query("SELECT payment_method, amount, sort_order FROM public.visit_payments WHERE visit_id = $1", [fullWidth.visit_id])).rows[0],
  { payment_method: "現金", amount: "5000", sort_order: 1 }
);

const spacedJapanese = await register("00000000-0000-0000-0000-000000000006");
assert.equal(spacedJapanese.reservation_id, "00000000-0000-0000-0000-000000000006");
assert.equal(
  (await db.query("SELECT status FROM public.reservations WHERE id = $1", [spacedJapanese.reservation_id])).rows[0].status,
  "完了"
);

await assert.rejects(
  () => register("00000000-0000-0000-0000-000000000007"),
  /VISIT_RESERVATION_ALREADY_COMPLETED/
);
await assert.rejects(
  () => register("00000000-0000-0000-0000-000000000008"),
  /VISIT_INVALID_RESERVATION/
);

await db.exec("RESET ROLE; SET ROLE anon;");
await assert.rejects(
  () => register("00000000-0000-0000-0000-000000000008"),
  /permission denied/
);
await db.exec("RESET ROLE; SET ROLE authenticated;");
await assert.rejects(
  () => register("00000000-0000-0000-0000-000000000008"),
  /permission denied/
);

await db.close();
console.log(
  "PASS: legacy confirmed reservations register one paid visit, complete atomically, reject completed/unconfirmed rows, and remain service-role-only"
);
