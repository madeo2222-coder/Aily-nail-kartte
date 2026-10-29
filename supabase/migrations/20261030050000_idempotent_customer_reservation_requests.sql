begin;

create function public.create_customer_requested_reservation_idempotent(
  p_operation_id uuid,
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
  v_existing public.reservations%rowtype;
begin
  if p_operation_id is null
    or p_end_at <= p_start_at
    or btrim(coalesce(p_menu, '')) = ''
  then
    return query select 'invalid_input'::text, null::uuid;
    return;
  end if;

  lock table public.reservations in share row exclusive mode;
  lock table public.external_calendar_blocks in share row exclusive mode;

  select reservation.*
  into v_existing
  from public.reservations as reservation
  where reservation.id = p_operation_id;

  if found then
    if v_existing.salon_id is not distinct from p_salon_id
      and v_existing.customer_id is not distinct from p_customer_id
      and v_existing.staff_id is not distinct from p_staff_id
      and btrim(coalesce(v_existing.menu, '')) = btrim(coalesce(p_menu, ''))
      and v_existing.start_at is not distinct from p_start_at
      and v_existing.end_at is not distinct from p_end_at
      and coalesce(v_existing.memo, '') = coalesce(p_memo, '')
      and public.normalize_reservation_workflow_status(v_existing.status)
        in ('requested', '予約申請中', '予約受付', '予約')
    then
      return query select 'already_created'::text, p_operation_id;
    else
      return query select 'idempotency_conflict'::text, null::uuid;
    end if;
    return;
  end if;

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

  select reservation.*
  into v_existing
  from public.reservations as reservation
  where reservation.salon_id = p_salon_id
    and reservation.customer_id = p_customer_id
    and reservation.start_at is not distinct from p_start_at
    and reservation.end_at is not distinct from p_end_at
    and btrim(coalesce(reservation.menu, '')) = btrim(coalesce(p_menu, ''))
    and coalesce(reservation.memo, '') = coalesce(p_memo, '')
    and public.normalize_reservation_workflow_status(reservation.status)
      not in ('cancelled', 'canceled', 'cancel', 'キャンセル', '取消', '取り消し')
  order by reservation.id
  limit 1;

  if found then
    return query select 'already_created'::text, v_existing.id;
    return;
  end if;

  if exists (
    select 1
    from public.reservations as reservation
    where reservation.salon_id = p_salon_id
      and reservation.customer_id = p_customer_id
      and reservation.start_at < p_end_at
      and reservation.end_at > p_start_at
      and public.normalize_reservation_workflow_status(reservation.status)
        not in ('cancelled', 'canceled', 'cancel', 'キャンセル', '取消', '取り消し')
  ) then
    return query select 'customer_unavailable'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1
    from public.reservations as reservation
    where reservation.salon_id = p_salon_id
      and (reservation.staff_id = p_staff_id or reservation.staff_id is null)
      and reservation.start_at < p_end_at
      and reservation.end_at > p_start_at
      and public.normalize_reservation_workflow_status(reservation.status)
        not in ('cancelled', 'canceled', 'cancel', 'キャンセル', '取消', '取り消し')
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
    id,
    menu,
    start_at,
    end_at,
    status,
    memo,
    staff_id,
    customer_id,
    salon_id,
    source
  ) values (
    p_operation_id,
    btrim(p_menu),
    p_start_at,
    p_end_at,
    'requested',
    coalesce(p_memo, ''),
    p_staff_id,
    p_customer_id,
    p_salon_id,
    'customer-app'
  );

  return query select 'created'::text, p_operation_id;
end;
$function$;

revoke all on function public.create_customer_requested_reservation_idempotent(
  uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text
) from public;
revoke all on function public.create_customer_requested_reservation_idempotent(
  uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text
) from anon;
revoke all on function public.create_customer_requested_reservation_idempotent(
  uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text
) from authenticated;
grant execute on function public.create_customer_requested_reservation_idempotent(
  uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text
) to service_role;

commit;
