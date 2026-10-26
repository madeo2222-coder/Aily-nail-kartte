-- Target project: shnkwaunrycqxgboqnam
-- Read-only preflight for 20261026200835_normalize_customer_requested_statuses.sql.
-- Covers customer writes, staff confirmation, and alternative-request delivery claiming.

select
  current_database() as database_name,
  current_user as executed_as,
  to_regprocedure(
    'public.create_customer_requested_reservation(uuid,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text)'
  ) is not null as create_rpc_exists,
  to_regprocedure(
    'public.update_customer_requested_reservation(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,text,timestamp with time zone,timestamp with time zone,text)'
  ) is not null as update_rpc_exists,
  to_regprocedure(
    'public.cancel_customer_requested_reservation(uuid,uuid)'
  ) is not null as cancel_rpc_exists,
  to_regprocedure(
    'public.normalize_reservation_workflow_status(text)'
  ) is not null as normalization_helper_exists,
  to_regprocedure(
    'public.confirm_staff_reservation(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text)'
  ) is not null as confirm_rpc_exists,
  to_regprocedure(
    'public.claim_reservation_alternative_request(uuid,uuid,uuid,uuid,text)'
  ) is not null as alternative_claim_rpc_exists,
  to_regprocedure(
    'public.claim_reservation_confirmation_delivery(uuid,uuid,uuid,uuid,text)'
  ) is not null as confirmation_delivery_claim_rpc_exists,
  case
    when to_regprocedure(
      'public.create_customer_requested_reservation(uuid,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text)'
    ) is null then null
    else has_function_privilege(
      'service_role',
      'public.create_customer_requested_reservation(uuid,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text)',
      'EXECUTE'
    )
  end as service_role_can_create,
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
  end as service_role_can_cancel,
  case
    when to_regprocedure(
      'public.confirm_staff_reservation(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text)'
    ) is null then null
    else has_function_privilege(
      'service_role',
      'public.confirm_staff_reservation(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text)',
      'EXECUTE'
    )
  end as service_role_can_confirm,
  case
    when to_regprocedure(
      'public.claim_reservation_alternative_request(uuid,uuid,uuid,uuid,text)'
    ) is null then null
    else has_function_privilege(
      'service_role',
      'public.claim_reservation_alternative_request(uuid,uuid,uuid,uuid,text)',
      'EXECUTE'
    )
  end as service_role_can_claim_alternative,
  case
    when to_regprocedure(
      'public.claim_reservation_confirmation_delivery(uuid,uuid,uuid,uuid,text)'
    ) is null then null
    else has_function_privilege(
      'service_role',
      'public.claim_reservation_confirmation_delivery(uuid,uuid,uuid,uuid,text)',
      'EXECUTE'
    )
  end as service_role_can_claim_confirmation_delivery;
