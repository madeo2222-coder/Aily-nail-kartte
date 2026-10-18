-- Aily project only. Read-only. Does not return customer/staff details.
-- Run with the project owner's SQL connection; do not apply grants/policies from guesses.
WITH targets AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v')
    AND c.relname IN ('customers','reservations','nail_tip_orders','sanmeigaku_diagnoses',
      'staffs','salons','visits','external_calendar_blocks','inbound_nail_tip_requests',
      'nail_tip_order_payments','inbound_nail_tip_payments',
      'reservation_alternative_requests','reservation_confirmation_deliveries')
)
SELECT 'table_access' AS section, relname AS object_name,
  jsonb_build_object(
    'rls',relrowsecurity,'force_rls',relforcerowsecurity,
    'anon_select',has_table_privilege('anon',oid,'SELECT'),
    'anon_column_select',has_any_column_privilege('anon',oid,'SELECT'),
    'anon_insert',has_table_privilege('anon',oid,'INSERT'),
    'anon_update',has_table_privilege('anon',oid,'UPDATE'),
    'anon_delete',has_table_privilege('anon',oid,'DELETE'),
    'authenticated_select',has_table_privilege('authenticated',oid,'SELECT')
  ) AS detail
FROM targets
UNION ALL
SELECT 'policy', p.tablename || '.' || p.policyname,
  jsonb_build_object('roles',p.roles,'command',p.cmd,'permissive',p.permissive,
    'using',p.qual,'with_check',p.with_check)
FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename IN (SELECT relname FROM targets)
UNION ALL
SELECT 'column', c.table_name || '.' || c.column_name,
  jsonb_build_object('type',c.data_type,'nullable',c.is_nullable)
FROM information_schema.columns c WHERE c.table_schema = 'public'
  AND c.table_name IN (SELECT relname FROM targets)
ORDER BY section, object_name;

-- Aggregates only: assess migration away from the legacy shared staff login.
SELECT
  count(*) FILTER (WHERE to_jsonb(s)->>'is_active'='true') AS active_staff,
  count(*) FILTER (WHERE to_jsonb(s)->>'is_active'='true' AND u.id IS NOT NULL) AS active_staff_with_auth_user,
  count(*) FILTER (WHERE to_jsonb(s)->>'is_active'='true' AND to_jsonb(s)->>'role'='owner' AND u.id IS NOT NULL) AS active_owner_with_auth_user
FROM public.staffs s
LEFT JOIN auth.users u ON u.id::text = to_jsonb(s)->>'user_id';
