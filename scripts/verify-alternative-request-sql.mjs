import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { PGlite } = await import(process.env.AILY_PGLITE_MODULE || '@electric-sql/pglite');

const root = fileURLToPath(new URL('../', import.meta.url));
const inspection = await readFile(`${root}/scripts/sql/aily-alternative-request-preflight.sql`, 'utf8');
const migration = await readFile(`${root}/supabase/migrations/20261003120111_reservation_alternative_requests.sql`, 'utf8');
const db = new PGlite();
const inspect = async () => (await db.exec(inspection)).find(r => r.fields?.some(f => f.name === 'check_name')).rows;
let checks = await inspect();
assert.ok(checks.every(r => r.result === 'MISSING'));
console.log('PASS: inspection works on a missing schema without reads or writes to customer data');

await db.exec(`
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.salons(id uuid PRIMARY KEY);
CREATE TABLE public.customers(id uuid PRIMARY KEY);
CREATE TABLE public.staffs(id uuid PRIMARY KEY, salon_id uuid, is_active boolean, role text);
CREATE TABLE public.reservations(id uuid PRIMARY KEY, customer_id uuid, salon_id uuid, status text);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
`);
checks = await inspect();
assert.equal(checks.find(r => r.check_name === 'service_role_lock:staffs').result, 'FAIL');
assert.equal(checks.find(r => r.check_name === 'service_role_lock:reservations').result, 'FAIL');
await db.exec('GRANT UPDATE ON public.staffs, public.reservations TO service_role;');
checks = await inspect();
assert.ok(checks.filter(r => r.section === 'prerequisite').every(r => r.result === 'PASS'));
assert.ok(checks.filter(r => r.section !== 'prerequisite').every(r => r.result === 'MISSING'));
console.log('PASS: prerequisite-only schema identified as an initial migration candidate');

await db.exec(migration);
checks = await inspect();
assert.deepEqual(checks.filter(r => !['PASS', 'PRESENT'].includes(r.result)), []);
console.log(`PASS: migrated schema passes all ${checks.length} catalog checks`);

await db.exec(`
INSERT INTO public.salons VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.customers VALUES ('00000000-0000-0000-0000-000000000002');
INSERT INTO public.staffs VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', true, 'staff');
INSERT INTO public.reservations VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'requested');
SET ROLE service_role;
`);
const claim = async (message = 'original request') => (await db.query(`
SELECT * FROM public.claim_reservation_alternative_request(
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003', $1)`, [message])).rows[0];
const complete = async (attempt, status) => (await db.query(`
SELECT public.complete_reservation_alternative_request(
  '00000000-0000-0000-0000-000000000004', $1, $2, 'mock result') AS completed`, [attempt, status])).rows[0].completed;
const first = await claim();
assert.equal(first.claim_status, 'claimed');
assert.equal((await claim()).claim_status, 'in_progress');
assert.equal(await complete(first.attempt_count, 'failed'), true);
const retry = await claim();
assert.equal(retry.line_retry_key, first.line_retry_key);
assert.equal(retry.line_message, first.line_message);
assert.equal(retry.attempt_count, first.attempt_count + 1);
assert.equal(await complete(retry.attempt_count, 'sent'), true);
assert.equal((await claim()).claim_status, 'already_sent');
const next = await claim('changed date request');
assert.equal(next.claim_status, 'claimed');
assert.notEqual(next.line_retry_key, retry.line_retry_key);
await db.exec(`UPDATE public.reservation_alternative_requests SET status = 'responded';`);
assert.equal(await complete(next.attempt_count, 'sent'), true);
assert.equal((await db.query('SELECT status FROM public.reservation_alternative_requests')).rows[0].status, 'responded');
console.log('PASS: SQL RPC claim/in-progress/failure/stable retry/sent/new-cycle/responded race');

await db.exec('RESET ROLE; SET ROLE anon;');
await assert.rejects(() => db.query('SELECT * FROM public.reservation_alternative_requests'), /permission denied/);
await assert.rejects(() => db.query(`SELECT public.complete_reservation_alternative_request(
  '00000000-0000-0000-0000-000000000004', 1, 'sent', null)`), /permission denied/);
await db.exec('RESET ROLE; SET ROLE authenticated;');
await assert.rejects(() => db.query('SELECT * FROM public.reservation_alternative_requests'), /permission denied/);
await assert.rejects(() => claim(), /permission denied/);
await db.exec('RESET ROLE;');
console.log('PASS: anon/authenticated cannot read the ledger or execute notification RPCs');

await db.exec('GRANT SELECT ON public.reservation_alternative_requests TO anon;');
checks = await inspect();
assert.equal(checks.find(r => r.check_name === 'table_access:anon').result, 'FAIL');
await db.exec('REVOKE SELECT ON public.reservation_alternative_requests FROM anon; GRANT SELECT(message) ON public.reservation_alternative_requests TO anon;');
checks = await inspect();
assert.equal(checks.find(r => r.check_name === 'table_access:anon').result, 'FAIL');
await db.exec('REVOKE SELECT(message) ON public.reservation_alternative_requests FROM anon;');
await db.exec(`REVOKE SELECT ON public.reservation_alternative_requests FROM anon;
ALTER FUNCTION public.complete_reservation_alternative_request(uuid,integer,text,text) SECURITY DEFINER;`);
checks = await inspect();
assert.equal(checks.find(r => r.check_name.endsWith(':invoker') && r.check_name.includes('complete_')).result, 'FAIL');
await db.exec(`ALTER FUNCTION public.complete_reservation_alternative_request(uuid,integer,text,text) SECURITY INVOKER;
CREATE OR REPLACE FUNCTION public.complete_reservation_alternative_request(
  p_reservation_id uuid,p_attempt_count integer,p_status text,p_error text default null)
RETURNS boolean LANGUAGE sql AS 'SELECT false';`);
checks = await inspect();
assert.equal(checks.find(r => r.check_name.endsWith(':body') && r.check_name.includes('complete_')).result, 'REVIEW');
console.log('PASS: unsafe privileges, SECURITY DEFINER, and older/different RPC bodies are detected');
await db.close();
console.log('All local PostgreSQL checks passed. No remote DB accessed and no LINE sent.');
