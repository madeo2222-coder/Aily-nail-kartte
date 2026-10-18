begin;

create table public.reservation_confirmation_deliveries (
  reservation_id uuid primary key,
  customer_id uuid not null,
  salon_id uuid not null,
  requested_by_staff_id uuid null,
  status text not null default 'pending',
  line_retry_key uuid not null unique default gen_random_uuid(),
  retry_key_created_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  message text not null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz null,

  constraint reservation_confirmation_deliveries_reservation_id_fkey
    foreign key (reservation_id)
    references public.reservations (id)
    on update restrict
    on delete cascade,

  constraint reservation_confirmation_deliveries_customer_id_fkey
    foreign key (customer_id)
    references public.customers (id)
    on update restrict
    on delete restrict,

  constraint reservation_confirmation_deliveries_salon_id_fkey
    foreign key (salon_id)
    references public.salons (id)
    on update restrict
    on delete restrict,

  constraint reservation_confirmation_deliveries_requested_by_staff_id_fkey
    foreign key (requested_by_staff_id)
    references public.staffs (id)
    on update restrict
    on delete set null,

  constraint reservation_confirmation_deliveries_status_check
    check (status in ('pending', 'sending', 'sent', 'failed')),

  constraint reservation_confirmation_deliveries_attempt_count_check
    check (attempt_count >= 0),

  constraint reservation_confirmation_deliveries_message_not_blank_check
    check (btrim(message) <> '')
);

create index reservation_confirmation_deliveries_salon_status_idx
  on public.reservation_confirmation_deliveries (salon_id, status, updated_at desc);

alter table public.reservation_confirmation_deliveries enable row level security;

revoke all on table public.reservation_confirmation_deliveries from public;
revoke all on table public.reservation_confirmation_deliveries from anon;
revoke all on table public.reservation_confirmation_deliveries from authenticated;
grant select, insert, update on table public.reservation_confirmation_deliveries to service_role;

comment on table public.reservation_confirmation_deliveries is
  'Tracks reservation-confirmation LINE delivery so staff retries are idempotent.';

comment on column public.reservation_confirmation_deliveries.line_retry_key is
  'Stable X-Line-Retry-Key reused for every safe retry of the same confirmation.';

create function public.claim_reservation_confirmation_delivery(
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
    and reservation.status in ('confirmed', '予約確定')
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

create function public.complete_reservation_confirmation_delivery(
  p_reservation_id uuid,
  p_attempt_count integer,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_affected_rows integer;
begin
  if p_status not in ('sent', 'failed') then
    raise exception using
      errcode = 'P0001',
      message = 'CONFIRMATION_DELIVERY_INVALID_COMPLETION';
  end if;

  update public.reservation_confirmation_deliveries
  set
    status = p_status,
    last_error = case when p_status = 'failed' then left(coalesce(p_error, ''), 1000) else null end,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    updated_at = now()
  where reservation_id = p_reservation_id
    and status = 'sending'
    and attempt_count = p_attempt_count;

  get diagnostics v_affected_rows = row_count;
  return v_affected_rows = 1;
end;
$function$;

revoke all on function public.claim_reservation_confirmation_delivery(uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.claim_reservation_confirmation_delivery(uuid, uuid, uuid, uuid, text) from anon;
revoke all on function public.claim_reservation_confirmation_delivery(uuid, uuid, uuid, uuid, text) from authenticated;
grant execute on function public.claim_reservation_confirmation_delivery(uuid, uuid, uuid, uuid, text) to service_role;

revoke all on function public.complete_reservation_confirmation_delivery(uuid, integer, text, text) from public;
revoke all on function public.complete_reservation_confirmation_delivery(uuid, integer, text, text) from anon;
revoke all on function public.complete_reservation_confirmation_delivery(uuid, integer, text, text) from authenticated;
grant execute on function public.complete_reservation_confirmation_delivery(uuid, integer, text, text) to service_role;

commit;
