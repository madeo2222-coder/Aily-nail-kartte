-- Target project: shnkwaunrycqxgboqnam
-- Read-only preflight for 20261026200835_normalize_customer_requested_statuses.sql.

select
  current_database() as database_name,
  current_user as executed_as,
  to_regprocedure(
    'public.update_customer_requested_reservation(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,text,timestamp with time zone,timestamp with time zone,text)'
  ) is not null as update_rpc_exists,
  to_regprocedure(
    'public.cancel_customer_requested_reservation(uuid,uuid)'
  ) is not null as cancel_rpc_exists,
  to_regprocedure(
    'public.normalize_reservation_workflow_status(text)'
  ) is not null as normalization_helper_exists,
  case
    when to_regprocedure(
      'public.update_customer_requested_reservation(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,text,timestamp with time zone,timestamp with time zone,text)'
    ) is null then null
    else has_function_privilege(
      'service_role',
      'public.update_customer_requested_reservation(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,text,timestamp with time zone,timestamp with time zone,text)',
      'EXECUTE'
    )
  end as service_role_can_update,
  case
    when to_regprocedure(
      'public.cancel_customer_requested_reservation(uuid,uuid)'
    ) is null then null
    else has_function_privilege(
      'service_role',
      'public.cancel_customer_requested_reservation(uuid,uuid)',
      'EXECUTE'
    )
  end as service_role_can_cancel;
