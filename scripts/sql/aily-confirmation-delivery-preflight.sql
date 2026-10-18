-- Aily only. Read-only catalog inspection; no customer rows or LINE calls.
-- Run this whole file in the correct Aily project's SQL Editor before applying
-- 20261004070432_reservation_confirmation_deliveries.sql.
begin transaction read only;

with expected_columns(table_name, column_name, type_name) as (
  values
    ('reservations', 'id', 'uuid'),
    ('reservations', 'customer_id', 'uuid'),
    ('reservations', 'salon_id', 'uuid'),
    ('reservations', 'staff_id', 'uuid'),
    ('reservations', 'status', 'text'),
    ('customers', 'id', 'uuid'),
    ('customers', 'salon_id', 'uuid'),
    ('customers', 'line_user_id', 'text'),
    ('salons', 'id', 'uuid'),
    ('staffs', 'id', 'uuid'),
    ('staffs', 'salon_id', 'uuid'),
    ('staffs', 'is_active', 'boolean'),
    ('staffs', 'role', 'text')
), expected_functions(signature, body_md5) as (
  values
    ('public.claim_reservation_confirmation_delivery(uuid,uuid,uuid,uuid,text)',
     '27b14359f8dd8c4f8956e7ba23745865'),
    ('public.complete_reservation_confirmation_delivery(uuid,integer,text,text)',
     'e65df1a03a5e180b5ab9a6fee8e624cf')
), functions as (
  select expected.*, procedure.oid, procedure.prosrc, procedure.prosecdef,
    procedure.proconfig, procedure.proacl, procedure.proowner
  from expected_functions expected
  left join pg_catalog.pg_proc procedure
    on procedure.oid = to_regprocedure(expected.signature)
), roles as (
  select wanted.name, role.oid
  from (values ('anon'), ('authenticated'), ('service_role')) wanted(name)
  left join pg_catalog.pg_roles role on role.rolname = wanted.name
), delivery_table as (
  select class.oid, class.relrowsecurity
  from pg_catalog.pg_class class
  where class.oid = to_regclass('public.reservation_confirmation_deliveries')
), checks(section, check_name, result, detail) as (
  select 'prerequisite', expected.table_name || '.' || expected.column_name,
    case
      when attribute.attname is null then 'MISSING'
      when attribute.atttypid = to_regtype(expected.type_name) then 'PASS'
      else 'REVIEW'
    end,
    coalesce(format_type(attribute.atttypid, attribute.atttypmod), 'missing')
  from expected_columns expected
  left join pg_catalog.pg_attribute attribute
    on attribute.attrelid = to_regclass('public.' || expected.table_name)
    and attribute.attname = expected.column_name
    and attribute.attnum > 0
    and not attribute.attisdropped

  union all
  select 'prerequisite', 'role:' || roles.name,
    case when roles.oid is null then 'MISSING' else 'PASS' end,
    roles.name
  from roles

  union all
  select 'delivery_ledger', 'table',
    case when exists (select 1 from delivery_table) then 'PRESENT' else 'MISSING' end,
    'public.reservation_confirmation_deliveries'

  union all
  select 'delivery_ledger', 'RLS',
    case
      when not exists (select 1 from delivery_table) then 'MISSING'
      when (select relrowsecurity from delivery_table) then 'PASS'
      else 'FAIL'
    end,
    'must be enabled after migration'

  union all
  select 'delivery_ledger', 'table_access:' || roles.name,
    case
      when roles.oid is null or not exists (select 1 from delivery_table) then 'MISSING'
      when roles.name = 'service_role' then
        case when has_table_privilege(roles.oid, (select oid from delivery_table), 'SELECT,INSERT,UPDATE')
          then 'PASS' else 'FAIL' end
      when has_table_privilege(
        roles.oid,
        (select oid from delivery_table),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) or has_any_column_privilege(
        roles.oid,
        (select oid from delivery_table),
        'SELECT,INSERT,UPDATE,REFERENCES'
      ) then 'FAIL'
      else 'PASS'
    end,
    case when roles.name = 'service_role' then 'SELECT/INSERT/UPDATE required'
      else 'no table privileges allowed' end
  from roles

  union all
  select 'delivery_ledger', 'table_access:PUBLIC',
    case
      when not exists (select 1 from delivery_table) then 'MISSING'
      when exists (
        select 1
        from delivery_table table_info,
          lateral aclexplode(coalesce(
            (select class.relacl from pg_catalog.pg_class class where class.oid = table_info.oid),
            acldefault('r', (select class.relowner from pg_catalog.pg_class class where class.oid = table_info.oid))
          )) access
        where access.grantee = 0
      ) then 'FAIL'
      else 'PASS'
    end,
    'no PUBLIC table privileges allowed'

  union all
  select 'function', function.signature || ':body',
    case
      when function.oid is null then 'MISSING'
      when md5(btrim(regexp_replace(function.prosrc, '\s+', ' ', 'g'))) = function.body_md5
        then 'PASS'
      else 'REVIEW'
    end,
    coalesce(md5(btrim(regexp_replace(function.prosrc, '\s+', ' ', 'g'))), 'missing')
  from functions function

  union all
  select 'function', function.signature || ':invoker',
    case
      when function.oid is null then 'MISSING'
      when function.prosecdef then 'FAIL'
      else 'PASS'
    end,
    'SECURITY INVOKER required'
  from functions function

  union all
  select 'function', function.signature || ':search_path',
    case
      when function.oid is null then 'MISSING'
      when coalesce(function.proconfig @> array['search_path=""'], false) then 'PASS'
      else 'REVIEW'
    end,
    'empty search_path required'
  from functions function

  union all
  select 'function', function.signature || ':execute:' || roles.name,
    case
      when function.oid is null or roles.oid is null then 'MISSING'
      when has_function_privilege(roles.oid, function.oid, 'EXECUTE') = (roles.name = 'service_role')
        then 'PASS'
      else 'FAIL'
    end,
    case when roles.name = 'service_role' then 'allowed' else 'must be denied' end
  from functions function
  cross join roles

  union all
  select 'function', function.signature || ':execute:PUBLIC',
    case
      when function.oid is null then 'MISSING'
      when exists (
        select 1
        from aclexplode(coalesce(function.proacl, acldefault('f', function.proowner))) access
        where access.grantee = 0 and access.privilege_type = 'EXECUTE'
      ) then 'FAIL'
      else 'PASS'
    end,
    'PUBLIC execute must be revoked'
  from functions function
)
select section, check_name, result, detail
from checks
order by section, check_name;

commit;
