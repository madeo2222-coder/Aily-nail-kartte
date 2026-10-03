begin;

create table public.reservation_alternative_requests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique,
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
  responded_at timestamptz null,

  constraint reservation_alternative_requests_reservation_id_fkey
    foreign key (reservation_id)
    references public.reservations (id)
    on update restrict
    on delete cascade,

  constraint reservation_alternative_requests_customer_id_fkey
    foreign key (customer_id)
    references public.customers (id)
    on update restrict
    on delete restrict,

  constraint reservation_alternative_requests_salon_id_fkey
    foreign key (salon_id)
    references public.salons (id)
    on update restrict
    on delete restrict,

  constraint reservation_alternative_requests_requested_by_staff_id_fkey
    foreign key (requested_by_staff_id)
    references public.staffs (id)
    on update restrict
    on delete set null,

  constraint reservation_alternative_requests_status_check
    check (status in ('pending', 'sending', 'sent', 'failed', 'responded', 'superseded')),

  constraint reservation_alternative_requests_attempt_count_check
    check (attempt_count >= 0),

  constraint reservation_alternative_requests_message_not_blank_check
    check (btrim(message) <> '')
);

create index reservation_alternative_requests_salon_status_idx
  on public.reservation_alternative_requests (salon_id, status, updated_at desc);

alter table public.reservation_alternative_requests enable row level security;

revoke all on table public.reservation_alternative_requests from public;
revoke all on table public.reservation_alternative_requests from anon;
revoke all on table public.reservation_alternative_requests from authenticated;
grant select, insert, update on table public.reservation_alternative_requests to service_role;

comment on table public.reservation_alternative_requests is
  'Tracks staff requests asking a LINE-linked customer to submit another preferred reservation time.';

comment on column public.reservation_alternative_requests.line_retry_key is
  'Stable X-Line-Retry-Key reused for every retry so LINE does not accept the same notification twice.';

comment on column public.reservation_alternative_requests.retry_key_created_at is
  'Start of the LINE 24-hour retry-key window for the current request cycle.';

create function public.claim_reservation_alternative_request(
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
    and reservation.status in ('requested', '予約申請中', '予約受付', '予約')
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

create function public.complete_reservation_alternative_request(
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
  v_current_status text;
  v_current_attempt_count integer;
begin
  if p_status not in ('sent', 'failed') then
    raise exception using
      errcode = 'P0001',
      message = 'ALTERNATIVE_REQUEST_INVALID_COMPLETION';
  end if;

  update public.reservation_alternative_requests
  set
    status = p_status,
    last_error = case when p_status = 'failed' then left(coalesce(p_error, ''), 1000) else null end,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    updated_at = now()
  where reservation_id = p_reservation_id
    and status = 'sending'
    and attempt_count = p_attempt_count;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows = 1 then
    return true;
  end if;

  select request.status, request.attempt_count
  into v_current_status, v_current_attempt_count
  from public.reservation_alternative_requests as request
  where request.reservation_id = p_reservation_id;

  if not found then
    return false;
  end if;

  return v_current_attempt_count = p_attempt_count
    and v_current_status in ('responded', 'superseded');
end;
$function$;

revoke all on function public.claim_reservation_alternative_request(uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.claim_reservation_alternative_request(uuid, uuid, uuid, uuid, text) from anon;
revoke all on function public.claim_reservation_alternative_request(uuid, uuid, uuid, uuid, text) from authenticated;
grant execute on function public.claim_reservation_alternative_request(uuid, uuid, uuid, uuid, text) to service_role;

revoke all on function public.complete_reservation_alternative_request(uuid, integer, text, text) from public;
revoke all on function public.complete_reservation_alternative_request(uuid, integer, text, text) from anon;
revoke all on function public.complete_reservation_alternative_request(uuid, integer, text, text) from authenticated;
grant execute on function public.complete_reservation_alternative_request(uuid, integer, text, text) to service_role;

commit;
