-- Aily only. Read-only catalog inspection; no customer rows or delivery RPC calls.
-- Run this whole file in the correct Aily project's SQL Editor.
begin transaction read only;

with expected_columns(table_name, column_name, type_name) as (
  values
    ('reservations', 'id', 'uuid'),
    ('reservations', 'customer_id', 'uuid'),
    ('reservations', 'salon_id', 'uuid'),
    ('reservations', 'status', 'text'),
    ('customers', 'id', 'uuid'),
    ('salons', 'id', 'uuid'),
    ('staffs', 'id', 'uuid'),
    ('staffs', 'salon_id', 'uuid'),
    ('staffs', 'is_active', 'boolean'),
    ('staffs', 'role', 'text')
), expected_functions(signature, body_md5) as (
  values
    ('public.claim_reservation_alternative_request(uuid,uuid,uuid,uuid,text)',
     '0301e15efaeca6d0b92e6d6a539272c8'),
    ('public.complete_reservation_alternative_request(uuid,integer,text,text)',
     'd0e138f41c78ae3d1ebd624f6f75054a')
), functions as (
  select e.*, p.oid, p.prosrc, p.prosecdef, p.proconfig, p.proacl, p.proowner
  from expected_functions e
  left join pg_catalog.pg_proc p on p.oid = to_regprocedure(e.signature)
), ledger as (
  select c.oid, c.relrowsecurity, c.relacl, c.relowner
  from pg_catalog.pg_class c
  where c.oid = to_regclass('public.reservation_alternative_requests')
), roles as (
  select wanted.name, r.oid
  from (values ('anon'), ('authenticated'), ('service_role')) wanted(name)
  left join pg_catalog.pg_roles r on r.rolname = wanted.name
), checks(section, check_name, result, detail) as (
  select 'prerequisite', e.table_name || '.' || e.column_name,
    case when a.attname is null then 'MISSING'
      when a.atttypid = to_regtype(e.type_name) then 'PASS' else 'REVIEW' end,
    coalesce(format_type(a.atttypid, a.atttypmod), 'missing')
  from expected_columns e
  left join pg_catalog.pg_attribute a
    on a.attrelid = to_regclass('public.' || e.table_name)
    and a.attname = e.column_name and a.attnum > 0 and not a.attisdropped
  union all
  select 'prerequisite', 'unique_id:' || t.table_name,
    case when exists (
      select 1 from pg_catalog.pg_index i
      join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attname = 'id'
      where i.indrelid = to_regclass('public.' || t.table_name)
        and i.indisunique and i.indisvalid and i.indnkeyatts = 1
        and i.indkey[0] = a.attnum and i.indpred is null
    ) then 'PASS' else 'MISSING' end, 'single-column unique key required for FK'
  from (values ('reservations'), ('customers'), ('salons'), ('staffs')) t(table_name)
  union all
  select 'prerequisite', 'role:' || name,
    case when oid is null then 'MISSING' else 'PASS' end, name from roles
  union all
  select 'prerequisite', 'service_role_lock:' || t.table_name,
    case when r.oid is null or to_regclass('public.' || t.table_name) is null then 'MISSING'
      when has_table_privilege(r.oid, to_regclass('public.' || t.table_name), 'SELECT')
        and has_table_privilege(r.oid, to_regclass('public.' || t.table_name), 'UPDATE')
        then 'PASS' else 'FAIL' end,
    'SELECT plus UPDATE required by FOR SHARE / FOR UPDATE'
  from (values ('reservations'), ('staffs')) t(table_name)
  cross join roles r where r.name = 'service_role'
  union all
  select 'ledger', 'table',
    case when exists (select 1 from ledger) then 'PRESENT' else 'MISSING' end,
    'public.reservation_alternative_requests'
  union all
  select 'ledger', 'RLS',
    case when not exists (select 1 from ledger) then 'MISSING'
      when (select relrowsecurity from ledger) then 'PASS' else 'FAIL' end,
    'must be enabled'
  union all
  select 'ledger', 'table_access:' || r.name,
    case when r.oid is null or not exists (select 1 from ledger) then 'MISSING'
      when r.name = 'service_role' then
        case when has_table_privilege(r.oid, (select oid from ledger), 'SELECT')
          and has_table_privilege(r.oid, (select oid from ledger), 'INSERT')
          and has_table_privilege(r.oid, (select oid from ledger), 'UPDATE')
          then 'PASS' else 'FAIL' end
      when has_table_privilege(r.oid, (select oid from ledger),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(r.oid, (select oid from ledger),
          'SELECT,INSERT,UPDATE,REFERENCES')
        then 'FAIL' else 'PASS' end,
    case when r.name = 'service_role' then 'SELECT/INSERT/UPDATE required'
      else 'no table privileges allowed' end
  from roles r
  union all
  select 'ledger', 'table_access:PUBLIC',
    case when not exists (select 1 from ledger) then 'MISSING'
      when exists (select 1 from ledger l,
        lateral aclexplode(coalesce(l.relacl, acldefault('r', l.relowner))) a
        where a.grantee = 0) then 'FAIL' else 'PASS' end,
    'no PUBLIC table privileges allowed'
  union all
  select 'function', f.signature || ':body',
    case when f.oid is null then 'MISSING'
      when md5(btrim(regexp_replace(f.prosrc, '\s+', ' ', 'g'))) = f.body_md5
        then 'PASS' else 'REVIEW' end,
    coalesce(md5(btrim(regexp_replace(f.prosrc, '\s+', ' ', 'g'))), 'missing')
  from functions f
  union all
  select 'function', f.signature || ':invoker',
    case when f.oid is null then 'MISSING'
      when f.prosecdef then 'FAIL' else 'PASS' end, 'SECURITY INVOKER required'
  from functions f
  union all
  select 'function', f.signature || ':search_path',
    case when f.oid is null then 'MISSING'
      when coalesce(f.proconfig @> array['search_path=""'], false)
        then 'PASS' else 'REVIEW' end, 'empty search_path required'
  from functions f
  union all
  select 'function', f.signature || ':execute:' || r.name,
    case when f.oid is null or r.oid is null then 'MISSING'
      when has_function_privilege(r.oid, f.oid, 'EXECUTE') = (r.name = 'service_role')
        then 'PASS' else 'FAIL' end,
    case when r.name = 'service_role' then 'allowed' else 'must be denied' end
  from functions f cross join roles r
  union all
  select 'function', f.signature || ':execute:PUBLIC',
    case when f.oid is null then 'MISSING'
      when exists (select 1
        from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE') then 'FAIL'
      else 'PASS' end, 'PUBLIC execute must be revoked'
  from functions f
)
select section, check_name, result, detail from checks
order by section, check_name;

commit;
