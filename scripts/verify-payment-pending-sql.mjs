import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.AILY_PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE TABLE nail_tip_orders(id uuid PRIMARY KEY, payment_url text, payment_due_at timestamptz,
    payment_status text, payment_transaction_id text, paid_at timestamptz);
  CREATE TABLE inbound_nail_tip_requests(id uuid PRIMARY KEY, quote_amount integer, payment_status text, status text);
  GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
`);
for (const migration of ["20260717000000_create_inbound_nail_tip_payments.sql", "20260720000000_create_nail_tip_order_payments.sql"]) {
  await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
}
const id = "11111111-1111-4111-8111-111111111111";
const hash = "a".repeat(64);
await db.query("INSERT INTO nail_tip_orders(id,product_code,product_name_snapshot,product_price,payment_link_token_hash,payment_due_at,payment_status) VALUES($1,'ruby','Fixture',13300,$2,now()+interval '1 day','payment_waiting')", [id, hash]);
await db.query("INSERT INTO inbound_nail_tip_requests VALUES($1,13300,'payment_waiting','quoted')", [id]);
await db.exec("SET ROLE service_role");
for (const kind of ["order", "inbound"]) {
  const create = orderId => kind === "order"
    ? db.query("SELECT * FROM create_nail_tip_order_payment($1,$2,$3)", [id, orderId, hash])
    : db.query("SELECT create_inbound_nail_tip_payment($1,13300,$2) AS payment_id", [id, orderId]);
  const firstId = `fixture-${kind}-1`;
  const first = (await create(firstId)).rows[0];
  if (kind === "order") assert.equal(first.amount, 13300);
  await assert.rejects(create(`fixture-${kind}-2`), /active payment/);
  const recordName = kind === "order" ? "record_nail_tip_order_payment_result" : "record_inbound_nail_tip_payment_result";
  const completeName = kind === "order" ? "complete_nail_tip_order_payment" : "complete_inbound_nail_tip_payment";
  await db.query(`SELECT ${recordName}($1,$2,'pending',NULL,NULL,'response unavailable')`, [first.payment_id, firstId]);
  await assert.rejects(create(`fixture-${kind}-3`), /active payment/);
  await db.query(`SELECT ${completeName}($1,$2,'success','A001000000000000',NULL)`, [first.payment_id, firstId]);
  // Repeat the same verified completion: exactly one paid payment remains.
  await db.query(`SELECT ${completeName}($1,$2,'success','A001000000000000',NULL)`, [first.payment_id, firstId]);
  await assert.rejects(create(`fixture-${kind}-4`), /already paid/);
  await assert.rejects(db.query(`SELECT ${recordName}($1,$2,'failed','failure',NULL,NULL)`, [first.payment_id, firstId]), /paid payment cannot be changed/);
  const table = kind === "order" ? "nail_tip_order_payments" : "inbound_nail_tip_payments";
  assert.deepEqual((await db.query(`SELECT status,count(*)::int AS count FROM ${table} GROUP BY status`)).rows, [{ status: "paid", count: 1 }]);
  console.log(`${kind}: processing/pending block retries; verified completion is idempotent; paid cannot become failed`);
}
await db.exec("RESET ROLE; SET ROLE anon");
await assert.rejects(db.query("SELECT * FROM nail_tip_order_payments"), /permission denied/);
await assert.rejects(db.query("SELECT * FROM create_nail_tip_order_payment($1,$2,$3)", [id, "anon-test", hash]), /permission denied/);
await db.close();
console.log("Local payment SQL verification passed; no remote database or gateway used.");
