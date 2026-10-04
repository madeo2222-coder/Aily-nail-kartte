begin;

create function public.confirm_staff_reservation(
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

  -- Serialize confirmation with customer writes and delayed HPB/minimo imports.
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

  if v_reservation.status in ('confirmed', '予約確定') then
    return query select 'already_confirmed'::text, p_reservation_id;
    return;
  end if;

  if v_reservation.status not in ('requested', '予約申請中', '予約受付', '予約')
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
      and coalesce(reservation.status, '') not in (
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
    and reservation.status in ('requested', '予約申請中', '予約受付', '予約')
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

commit;
