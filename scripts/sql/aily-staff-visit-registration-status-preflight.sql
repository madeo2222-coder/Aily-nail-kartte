-- Target project: shnkwaunrycqxgboqnam
-- Read-only preflight for 20261027080000_normalize_staff_visit_reservation_status.sql.

select
  current_database() as database_name,
  current_user as executed_as,
  to_regprocedure(
    'public.register_staff_visit(uuid,uuid,uuid,uuid,uuid,date,text,text,integer,text,date,text,jsonb)'
  ) is not null as register_visit_rpc_exists,
  to_regprocedure(
    'public.normalize_reservation_workflow_status(text)'
  ) is not null as normalization_helper_exists,
  case
    when to_regprocedure(
      'public.register_staff_visit(uuid,uuid,uuid,uuid,uuid,date,text,text,integer,text,date,text,jsonb)'
    ) is null then null
    else has_function_privilege(
      'service_role',
      'public.register_staff_visit(uuid,uuid,uuid,uuid,uuid,date,text,text,integer,text,date,text,jsonb)',
      'EXECUTE'
    )
  end as service_role_can_register_visit,
  case
    when to_regprocedure(
      'public.register_staff_visit(uuid,uuid,uuid,uuid,uuid,date,text,text,integer,text,date,text,jsonb)'
    ) is null then null
    else has_function_privilege(
      'anon',
      'public.register_staff_visit(uuid,uuid,uuid,uuid,uuid,date,text,text,integer,text,date,text,jsonb)',
      'EXECUTE'
    )
  end as anon_can_register_visit,
  case
    when to_regprocedure(
      'public.register_staff_visit(uuid,uuid,uuid,uuid,uuid,date,text,text,integer,text,date,text,jsonb)'
    ) is null then null
    else has_function_privilege(
      'authenticated',
      'public.register_staff_visit(uuid,uuid,uuid,uuid,uuid,date,text,text,integer,text,date,text,jsonb)',
      'EXECUTE'
    )
  end as authenticated_can_register_visit;
