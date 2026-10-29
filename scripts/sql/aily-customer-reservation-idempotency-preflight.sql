-- Read-only preflight for Aily project shnkwaunrycqxgboqnam.
-- It returns metadata and aggregate counts only; no customer rows are read.
select
  to_regprocedure(
    'public.normalize_reservation_workflow_status(text)'
  ) is not null as normalization_helper_exists,
  to_regprocedure(
    'public.create_customer_requested_reservation_idempotent(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text)'
  ) is not null as idempotent_create_rpc_exists,
  case
    when to_regprocedure(
      'public.create_customer_requested_reservation_idempotent(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text)'
    ) is null then false
    else has_function_privilege(
      'service_role',
      to_regprocedure(
        'public.create_customer_requested_reservation_idempotent(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text)'
      ),
      'EXECUTE'
    )
  end as service_role_can_execute;
