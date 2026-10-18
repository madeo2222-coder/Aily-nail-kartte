import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { PGlite } = await import(
  process.env.AILY_PGLITE_MODULE || "@electric-sql/pglite"
);

const sql = await readFile(
  new URL("../scripts/sql/aily-commerce-salon-readiness.sql", import.meta.url),
  "utf8"
);

test("commerce salon readiness SQL returns counts without changing rows", async () => {
  assert.doesNotMatch(
    sql.replace(/^\s*--.*$/gm, ""),
    /\b(insert|update|delete|alter|drop|truncate|grant|revoke)\b/i
  );

  const db = new PGlite();
  await db.exec(`
    create table staffs (
      id uuid primary key,
      salon_id uuid,
      user_id uuid,
      role text,
      is_active boolean not null
    );
    create table nail_tip_orders (
      id uuid primary key,
      salon_id uuid
    );
    create table inbound_nail_tip_requests (
      id uuid primary key
    );

    insert into staffs values
      ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'owner', true),
      ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'staff', true);
    insert into nail_tip_orders values
      ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      ('66666666-6666-4666-8666-666666666666', null);
    insert into inbound_nail_tip_requests values
      ('77777777-7777-4777-8777-777777777777');
  `);

  const before = await db.query(`
    select
      (select count(*)::int from staffs) as staff_count,
      (select count(*)::int from nail_tip_orders) as order_count,
      (select count(*)::int from inbound_nail_tip_requests) as inbound_count
  `);
  const result = await db.query(sql);
  const after = await db.query(`
    select
      (select count(*)::int from staffs) as staff_count,
      (select count(*)::int from nail_tip_orders) as order_count,
      (select count(*)::int from inbound_nail_tip_requests) as inbound_count
  `);

  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(result.rows, [
    {
      linked_owner_salon_count: 1,
      domestic_order_count: 2,
      domestic_order_unassigned_count: 1,
      domestic_order_linked_owner_salon_count: 1,
      inbound_request_count: 1,
      inbound_has_uuid_salon_id: false,
    },
  ]);

  await db.close();
});
