begin;

create or replace function public.normalize_reservation_workflow_status(
  p_status text
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select lower(
    regexp_replace(
      translate(
        coalesce(p_status, ''),
        'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      ),
      '[[:space:]　]+',
      '',
      'g'
    )
  );
$function$;

create or replace function public.create_customer_requested_reservation(
  p_salon_id uuid,
  p_customer_id uuid,
  p_staff_id uuid,
  p_menu text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_memo text
)
returns table (
  outcome text,
  reservation_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_reservation_id uuid;
begin
  if p_end_at <= p_start_at or btrim(coalesce(p_menu, '')) = '' then
    return query select 'invalid_input'::text, null::uuid;
    return;
  end if;

  lock table public.reservations in share row exclusive mode;
  lock table public.external_calendar_blocks in share row exclusive mode;

  perform 1
  from public.customers as customer
  where customer.id = p_customer_id
    and (customer.salon_id = p_salon_id or customer.salon_id is null)
  for share;

  if not found then
    return query select 'invalid_customer'::text, null::uuid;
    return;
  end if;

  perform 1
  from public.staffs as staff
  where staff.id = p_staff_id
    and staff.salon_id = p_salon_id
    and staff.role = 'staff'
    and staff.is_active is true
    and staff.customer_booking_enabled is true
  for share;

  if not found then
    return query select 'invalid_staff'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1
    from public.reservations as reservation
    where reservation.salon_id = p_salon_id
      and (reservation.staff_id = p_staff_id or reservation.staff_id is null)
      and reservation.start_at < p_end_at
      and reservation.end_at > p_start_at
      and public.normalize_reservation_workflow_status(reservation.status) not in (
        'cancelled', 'canceled', 'cancel', 'キャンセル', '取消', '取り消し'
      )
  ) or exists (
    select 1
    from public.external_calendar_blocks as block
    where block.salon_id = p_salon_id
      and (block.staff_id = p_staff_id or block.staff_id is null)
      and block.start_at < p_end_at
      and block.end_at > p_start_at
  ) then
    return query select 'slot_unavailable'::text, null::uuid;
    return;
  end if;

  insert into public.reservations (
    menu,
    start_at,
    end_at,
    status,
    memo,
    staff_id,
    customer_id,
    salon_id
  ) values (
    btrim(p_menu),
    p_start_at,
    p_end_at,
    'requested',
    coalesce(p_memo, ''),
    p_staff_id,
    p_customer_id,
    p_salon_id
  )
  returning id into v_reservation_id;

  return query select 'created'::text, v_reservation_id;
end;
$function$;

create or replace function public.update_customer_requested_reservation(
  p_reservation_id uuid,
  p_customer_id uuid,
  p_expected_start_at timestamptz,
  p_expected_end_at timestamptz,
  p_staff_id uuid,
  p_menu text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_memo text
)
returns table (
  outcome text,
  reservation_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_reservation public.reservations%rowtype;
  v_updated_id uuid;
begin
  if p_end_at <= p_start_at or btrim(coalesce(p_menu, '')) = '' then
    return query select 'invalid_input'::text, null::uuid;
    return;
  end if;

  lock table public.reservations in share row exclusive mode;
  lock table public.external_calendar_blocks in share row exclusive mode;

  select reservation.*
  into v_reservation
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and reservation.customer_id = p_customer_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if public.normalize_reservation_workflow_status(v_reservation.status) not in ('requested', '予約申請中', '予約受付', '予約')
    or v_reservation.start_at is distinct from p_expected_start_at
    or v_reservation.end_at is distinct from p_expected_end_at
  then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  if p_staff_id is not null then
    perform 1
    from public.staffs as staff
    where staff.id = p_staff_id
      and staff.salon_id = v_reservation.salon_id
      and staff.role = 'staff'
      and staff.is_active is true
      and staff.customer_booking_enabled is true
    for share;

    if not found then
      return query select 'invalid_staff'::text, null::uuid;
      return;
    end if;
  end if;

  if exists (
    select 1
    from public.reservations as reservation
    where reservation.id <> p_reservation_id
      and reservation.salon_id = v_reservation.salon_id
      and (
        p_staff_id is null
        or reservation.staff_id = p_staff_id
        or reservation.staff_id is null
      )
      and reservation.start_at < p_end_at
      and reservation.end_at > p_start_at
      and public.normalize_reservation_workflow_status(reservation.status) not in (
        'cancelled', 'canceled', 'cancel', 'キャンセル', '取消', '取り消し'
      )
  ) or exists (
    select 1
    from public.external_calendar_blocks as block
    where block.salon_id = v_reservation.salon_id
      and (
        p_staff_id is null
        or block.staff_id = p_staff_id
        or block.staff_id is null
      )
      and block.start_at < p_end_at
      and block.end_at > p_start_at
  ) then
    return query select 'slot_unavailable'::text, null::uuid;
    return;
  end if;

  update public.reservations as reservation
  set
    start_at = p_start_at,
    end_at = p_end_at,
    menu = btrim(p_menu),
    memo = coalesce(p_memo, ''),
    source = 'customer-app',
    staff_id = p_staff_id
  where reservation.id = p_reservation_id
    and reservation.customer_id = p_customer_id
    and public.normalize_reservation_workflow_status(reservation.status) in ('requested', '予約申請中', '予約受付', '予約')
    and reservation.start_at is not distinct from p_expected_start_at
    and reservation.end_at is not distinct from p_expected_end_at
  returning reservation.id into v_updated_id;

  if v_updated_id is null then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  update public.reservation_alternative_requests as request
  set
    status = 'responded',
    responded_at = now(),
    updated_at = now()
  where request.reservation_id = p_reservation_id
    and request.customer_id = p_customer_id
    and request.status in ('pending', 'sending', 'sent', 'failed');

  return query select 'updated'::text, v_updated_id;
end;
$function$;

create or replace function public.cancel_customer_requested_reservation(
  p_reservation_id uuid,
  p_customer_id uuid
)
returns table (
  outcome text,
  reservation_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_reservation public.reservations%rowtype;
begin
  select reservation.*
  into v_reservation
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and reservation.customer_id = p_customer_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if public.normalize_reservation_workflow_status(v_reservation.status) not in ('requested', '予約申請中', '予約受付', '予約') then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  update public.reservations as reservation
  set status = 'cancelled'
  where reservation.id = p_reservation_id
    and reservation.customer_id = p_customer_id
    and public.normalize_reservation_workflow_status(reservation.status) in ('requested', '予約申請中', '予約受付', '予約');

  if not found then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  update public.reservation_alternative_requests as request
  set
    status = 'superseded',
    updated_at = now()
  where request.reservation_id = p_reservation_id
    and request.customer_id = p_customer_id
    and request.status in ('pending', 'sending', 'sent', 'failed');

  return query select 'cancelled'::text, p_reservation_id;
end;
$function$;

create or replace function public.confirm_staff_reservation(
  p_reservation_id uuid,
  p_salon_id uuid,
  p_expected_start_at timestamptz,
  p_expected_end_at timestamptz,
  p_customer_id uuid,
  p_staff_id uuid,
  p_menu text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_memo text
)
returns table (
  outcome text,
  reservation_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_reservation public.reservations%rowtype;
  v_updated_id uuid;
begin
  if p_staff_id is null
    or p_end_at <= p_start_at
    or btrim(coalesce(p_menu, '')) = ''
  then
    return query select 'invalid_input'::text, null::uuid;
    return;
  end if;

  lock table public.reservations in share row exclusive mode;
  lock table public.external_calendar_blocks in share row exclusive mode;

  select reservation.*
  into v_reservation
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and reservation.salon_id = p_salon_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if public.normalize_reservation_workflow_status(v_reservation.status) in ('confirmed', '予約確定') then
    return query select 'already_confirmed'::text, p_reservation_id;
    return;
  end if;

  if public.normalize_reservation_workflow_status(v_reservation.status) not in ('requested', '予約申請中', '予約受付', '予約')
    or v_reservation.start_at is distinct from p_expected_start_at
    or v_reservation.end_at is distinct from p_expected_end_at
  then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  perform 1
  from public.staffs as staff
  where staff.id = p_staff_id
    and staff.salon_id = p_salon_id
    and staff.role = 'staff'
    and staff.is_active is true
  for share;

  if not found then
    return query select 'invalid_staff'::text, null::uuid;
    return;
  end if;

  if p_customer_id is not null then
    perform 1
    from public.customers as customer
    where customer.id = p_customer_id
      and (customer.salon_id = p_salon_id or customer.salon_id is null)
    for share;

    if not found then
      return query select 'invalid_customer'::text, null::uuid;
      return;
    end if;
  end if;

  if exists (
    select 1
    from public.reservations as reservation
    where reservation.id <> p_reservation_id
      and reservation.salon_id = p_salon_id
      and (reservation.staff_id = p_staff_id or reservation.staff_id is null)
      and reservation.start_at < p_end_at
      and reservation.end_at > p_start_at
      and public.normalize_reservation_workflow_status(reservation.status) not in (
        'cancelled', 'canceled', 'cancel', 'キャンセル', '取消', '取り消し'
      )
  ) or exists (
    select 1
    from public.external_calendar_blocks as block
    where block.salon_id = p_salon_id
      and (block.staff_id = p_staff_id or block.staff_id is null)
      and block.start_at < p_end_at
      and block.end_at > p_start_at
  ) then
    return query select 'slot_unavailable'::text, null::uuid;
    return;
  end if;

  update public.reservations as reservation
  set
    customer_id = p_customer_id,
    staff_id = p_staff_id,
    menu = btrim(p_menu),
    start_at = p_start_at,
    end_at = p_end_at,
    status = 'confirmed',
    memo = coalesce(p_memo, '')
  where reservation.id = p_reservation_id
    and reservation.salon_id = p_salon_id
    and public.normalize_reservation_workflow_status(reservation.status) in ('requested', '予約申請中', '予約受付', '予約')
    and reservation.start_at is not distinct from p_expected_start_at
    and reservation.end_at is not distinct from p_expected_end_at
  returning reservation.id into v_updated_id;

  if v_updated_id is null then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  update public.reservation_alternative_requests as request
  set
    status = 'superseded',
    updated_at = now()
  where request.reservation_id = p_reservation_id
    and request.status in ('pending', 'sending', 'sent', 'failed');

  return query select 'confirmed'::text, v_updated_id;
end;
$function$;

create or replace function public.claim_reservation_alternative_request(
  p_reservation_id uuid,
  p_customer_id uuid,
  p_salon_id uuid,
  p_requested_by_staff_id uuid,
  p_message text
)
returns table (
  claim_status text,
  attempt_count integer,
  line_retry_key uuid,
  line_message text
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_request public.reservation_alternative_requests%rowtype;
begin
  perform 1
  from public.staffs as staff
  where staff.id = p_requested_by_staff_id
    and staff.salon_id = p_salon_id
    and staff.is_active is true
    and staff.role in ('owner', 'staff')
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ALTERNATIVE_REQUEST_INVALID_STAFF';
  end if;

  perform 1
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and reservation.customer_id = p_customer_id
    and reservation.salon_id = p_salon_id
    and public.normalize_reservation_workflow_status(reservation.status) in ('requested', '予約申請中', '予約受付', '予約')
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ALTERNATIVE_REQUEST_INVALID_RESERVATION';
  end if;

  insert into public.reservation_alternative_requests (
    reservation_id,
    customer_id,
    salon_id,
    requested_by_staff_id,
    message
  ) values (
    p_reservation_id,
    p_customer_id,
    p_salon_id,
    p_requested_by_staff_id,
    p_message
  )
  on conflict (reservation_id) do nothing;

  select request.*
  into v_request
  from public.reservation_alternative_requests as request
  where request.reservation_id = p_reservation_id
  for update;

  if v_request.customer_id is distinct from p_customer_id
    or v_request.salon_id is distinct from p_salon_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'ALTERNATIVE_REQUEST_SCOPE_MISMATCH';
  end if;

  if v_request.status = 'sent'
    and v_request.message is not distinct from p_message
  then
    return query select
      'already_sent'::text,
      v_request.attempt_count,
      v_request.line_retry_key,
      v_request.message;
    return;
  end if;

  if v_request.status in ('sent', 'responded') then
    update public.reservation_alternative_requests as request
    set
      status = 'sending',
      requested_by_staff_id = p_requested_by_staff_id,
      line_retry_key = gen_random_uuid(),
      retry_key_created_at = now(),
      attempt_count = request.attempt_count + 1,
      message = p_message,
      last_error = null,
      sent_at = null,
      responded_at = null,
      updated_at = now()
    where request.id = v_request.id
    returning request.* into v_request;

    return query select
      'claimed'::text,
      v_request.attempt_count,
      v_request.line_retry_key,
      v_request.message;
    return;
  end if;

  if v_request.status = 'sending'
    and v_request.updated_at >= now() - interval '5 minutes'
  then
    return query select
      'in_progress'::text,
      v_request.attempt_count,
      v_request.line_retry_key,
      v_request.message;
    return;
  end if;

  if v_request.attempt_count > 0
    and v_request.retry_key_created_at < now() - interval '23 hours'
  then
    return query select
      'retry_expired'::text,
      v_request.attempt_count,
      v_request.line_retry_key,
      v_request.message;
    return;
  end if;

  update public.reservation_alternative_requests as request
  set
    status = 'sending',
    requested_by_staff_id = p_requested_by_staff_id,
    attempt_count = request.attempt_count + 1,
    last_error = null,
    updated_at = now()
  where request.id = v_request.id
  returning request.* into v_request;

  return query select
    'claimed'::text,
    v_request.attempt_count,
    v_request.line_retry_key,
    v_request.message;
end;
$function$;


create or replace function public.claim_reservation_confirmation_delivery(
  p_reservation_id uuid,
  p_customer_id uuid,
  p_salon_id uuid,
  p_requested_by_staff_id uuid,
  p_message text
)
returns table (
  claim_status text,
  attempt_count integer,
  line_retry_key uuid,
  line_message text
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_delivery public.reservation_confirmation_deliveries%rowtype;
begin
  perform 1
  from public.staffs as staff
  where staff.id = p_requested_by_staff_id
    and staff.salon_id = p_salon_id
    and staff.is_active is true
    and staff.role in ('owner', 'staff')
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'CONFIRMATION_DELIVERY_INVALID_STAFF';
  end if;

  perform 1
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and reservation.customer_id = p_customer_id
    and reservation.salon_id = p_salon_id
    and public.normalize_reservation_workflow_status(reservation.status) in ('confirmed', '予約確定')
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'CONFIRMATION_DELIVERY_INVALID_RESERVATION';
  end if;

  insert into public.reservation_confirmation_deliveries (
    reservation_id,
    customer_id,
    salon_id,
    requested_by_staff_id,
    message
  ) values (
    p_reservation_id,
    p_customer_id,
    p_salon_id,
    p_requested_by_staff_id,
    p_message
  )
  on conflict (reservation_id) do nothing;

  select delivery.*
  into v_delivery
  from public.reservation_confirmation_deliveries as delivery
  where delivery.reservation_id = p_reservation_id
  for update;

  if v_delivery.customer_id is distinct from p_customer_id
    or v_delivery.salon_id is distinct from p_salon_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'CONFIRMATION_DELIVERY_SCOPE_MISMATCH';
  end if;

  if v_delivery.status = 'sent' then
    return query select
      'already_sent'::text,
      v_delivery.attempt_count,
      v_delivery.line_retry_key,
      v_delivery.message;
    return;
  end if;

  if v_delivery.message is distinct from p_message then
    raise exception using
      errcode = 'P0001',
      message = 'CONFIRMATION_DELIVERY_MESSAGE_CHANGED';
  end if;

  if v_delivery.status = 'sending'
    and v_delivery.updated_at >= now() - interval '5 minutes'
  then
    return query select
      'in_progress'::text,
      v_delivery.attempt_count,
      v_delivery.line_retry_key,
      v_delivery.message;
    return;
  end if;

  if v_delivery.attempt_count > 0
    and v_delivery.retry_key_created_at < now() - interval '23 hours'
  then
    return query select
      'retry_expired'::text,
      v_delivery.attempt_count,
      v_delivery.line_retry_key,
      v_delivery.message;
    return;
  end if;

  update public.reservation_confirmation_deliveries as delivery
  set
    status = 'sending',
    requested_by_staff_id = p_requested_by_staff_id,
    attempt_count = delivery.attempt_count + 1,
    last_error = null,
    updated_at = now()
  where delivery.reservation_id = p_reservation_id
  returning delivery.* into v_delivery;

  return query select
    'claimed'::text,
    v_delivery.attempt_count,
    v_delivery.line_retry_key,
    v_delivery.message;
end;
$function$;

revoke all on function public.normalize_reservation_workflow_status(text) from public;
revoke all on function public.normalize_reservation_workflow_status(text) from anon;
revoke all on function public.normalize_reservation_workflow_status(text) from authenticated;
grant execute on function public.normalize_reservation_workflow_status(text) to service_role;

revoke all on function public.create_customer_requested_reservation(
  uuid, uuid, uuid, text, timestamptz, timestamptz, text
) from public;
revoke all on function public.create_customer_requested_reservation(
  uuid, uuid, uuid, text, timestamptz, timestamptz, text
) from anon;
revoke all on function public.create_customer_requested_reservation(
  uuid, uuid, uuid, text, timestamptz, timestamptz, text
) from authenticated;
grant execute on function public.create_customer_requested_reservation(
  uuid, uuid, uuid, text, timestamptz, timestamptz, text
) to service_role;

revoke all on function public.update_customer_requested_reservation(
  uuid, uuid, timestamptz, timestamptz, uuid, text, timestamptz, timestamptz, text
) from public;
revoke all on function public.update_customer_requested_reservation(
  uuid, uuid, timestamptz, timestamptz, uuid, text, timestamptz, timestamptz, text
) from anon;
revoke all on function public.update_customer_requested_reservation(
  uuid, uuid, timestamptz, timestamptz, uuid, text, timestamptz, timestamptz, text
) from authenticated;
grant execute on function public.update_customer_requested_reservation(
  uuid, uuid, timestamptz, timestamptz, uuid, text, timestamptz, timestamptz, text
) to service_role;

revoke all on function public.cancel_customer_requested_reservation(uuid, uuid) from public;
revoke all on function public.cancel_customer_requested_reservation(uuid, uuid) from anon;
revoke all on function public.cancel_customer_requested_reservation(uuid, uuid) from authenticated;
grant execute on function public.cancel_customer_requested_reservation(uuid, uuid) to service_role;

revoke all on function public.confirm_staff_reservation(
  uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, timestamptz, timestamptz, text
) from public;
revoke all on function public.confirm_staff_reservation(
  uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, timestamptz, timestamptz, text
) from anon;
revoke all on function public.confirm_staff_reservation(
  uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, timestamptz, timestamptz, text
) from authenticated;
grant execute on function public.confirm_staff_reservation(
  uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, timestamptz, timestamptz, text
) to service_role;

revoke all on function public.claim_reservation_alternative_request(uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.claim_reservation_alternative_request(uuid, uuid, uuid, uuid, text) from anon;
revoke all on function public.claim_reservation_alternative_request(uuid, uuid, uuid, uuid, text) from authenticated;
grant execute on function public.claim_reservation_alternative_request(uuid, uuid, uuid, uuid, text) to service_role;

revoke all on function public.claim_reservation_confirmation_delivery(uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.claim_reservation_confirmation_delivery(uuid, uuid, uuid, uuid, text) from anon;
revoke all on function public.claim_reservation_confirmation_delivery(uuid, uuid, uuid, uuid, text) from authenticated;
grant execute on function public.claim_reservation_confirmation_delivery(uuid, uuid, uuid, uuid, text) to service_role;

commit;
