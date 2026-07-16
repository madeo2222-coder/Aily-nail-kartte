begin;

create table public.inbound_nail_tip_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  order_id text not null,
  amount integer not null,
  status text not null default 'processing',
  mstatus text null,
  v_result_code text null,
  merr_msg text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,

  constraint inbound_nail_tip_payments_request_id_fkey
    foreign key (request_id)
    references public.inbound_nail_tip_requests (id)
    on delete restrict,

  constraint inbound_nail_tip_payments_order_id_key
    unique (order_id),

  constraint inbound_nail_tip_payments_amount_check
    check (amount > 0),

  constraint inbound_nail_tip_payments_status_check
    check (
      status in (
        'processing',
        'pending',
        'paid',
        'failed'
      )
    ),

  constraint inbound_nail_tip_payments_order_id_not_blank_check
    check (btrim(order_id) <> '')
);

comment on table public.inbound_nail_tip_payments is
  'DGフィナンシャル／VeriTransによるネイルチップ決済の処理履歴';

comment on column public.inbound_nail_tip_payments.request_id is
  '対象となるインバウンドネイルチップ相談ID';

comment on column public.inbound_nail_tip_payments.order_id is
  'VeriTransへ送信する一意の注文ID';

comment on column public.inbound_nail_tip_payments.amount is
  '決済金額。inbound_nail_tip_requests.quote_amountと一致させる';

comment on column public.inbound_nail_tip_payments.status is
  'processing、pending、paid、failedのいずれか';

create unique index inbound_nail_tip_payments_one_active_per_request_idx
  on public.inbound_nail_tip_payments (request_id)
  where status in ('processing', 'pending', 'paid');

create index inbound_nail_tip_payments_request_id_idx
  on public.inbound_nail_tip_payments (request_id);

create index inbound_nail_tip_payments_created_at_idx
  on public.inbound_nail_tip_payments (created_at desc);

alter table public.inbound_nail_tip_payments
  enable row level security;

revoke all
  on table public.inbound_nail_tip_payments
  from public;

revoke all
  on table public.inbound_nail_tip_payments
  from anon;

revoke all
  on table public.inbound_nail_tip_payments
  from authenticated;

grant select, insert, update
  on table public.inbound_nail_tip_payments
  to service_role;


create or replace function public.create_inbound_nail_tip_payment(
  p_request_id uuid,
  p_amount integer,
  p_order_id text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quote_amount integer;
  v_request_payment_status text;
  v_payment_id uuid;
begin
  if p_request_id is null then
    raise exception 'request_id is required'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero'
      using errcode = '22023';
  end if;

  if p_order_id is null or btrim(p_order_id) = '' then
    raise exception 'order_id is required'
      using errcode = '22023';
  end if;

  select
    quote_amount,
    payment_status
  into
    v_quote_amount,
    v_request_payment_status
  from public.inbound_nail_tip_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'inbound nail tip request was not found'
      using errcode = 'P0002';
  end if;

  if v_quote_amount is null then
    raise exception 'quote amount is not set'
      using errcode = '22023';
  end if;

  if v_quote_amount <> p_amount then
    raise exception 'payment amount does not match quote amount'
      using errcode = '22023';
  end if;

  if v_request_payment_status = 'paid' then
    raise exception 'request is already paid'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.inbound_nail_tip_payments
    where request_id = p_request_id
      and status in ('processing', 'pending', 'paid')
  ) then
    raise exception 'an active payment already exists for this request'
      using errcode = 'P0001';
  end if;

  insert into public.inbound_nail_tip_payments (
    request_id,
    order_id,
    amount,
    status,
    created_at,
    updated_at
  )
  values (
    p_request_id,
    btrim(p_order_id),
    p_amount,
    'processing',
    now(),
    now()
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;


create or replace function public.complete_inbound_nail_tip_payment(
  p_payment_id uuid,
  p_order_id text,
  p_mstatus text,
  p_v_result_code text,
  p_merr_msg text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request_id uuid;
  v_stored_order_id text;
  v_payment_status text;
begin
  if p_payment_id is null then
    raise exception 'payment_id is required'
      using errcode = '22023';
  end if;

  if p_order_id is null or btrim(p_order_id) = '' then
    raise exception 'order_id is required'
      using errcode = '22023';
  end if;

  if p_mstatus is null or btrim(p_mstatus) = '' then
    raise exception 'mstatus is required'
      using errcode = '22023';
  end if;

  if p_v_result_code is null or btrim(p_v_result_code) = '' then
    raise exception 'v_result_code is required'
      using errcode = '22023';
  end if;

  select
    request_id,
    order_id,
    status
  into
    v_request_id,
    v_stored_order_id,
    v_payment_status
  from public.inbound_nail_tip_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment was not found'
      using errcode = 'P0002';
  end if;

  if v_stored_order_id <> btrim(p_order_id) then
    raise exception 'order_id does not match'
      using errcode = '22023';
  end if;

  if v_payment_status = 'paid' then
    return v_request_id;
  end if;

  if v_payment_status not in ('processing', 'pending') then
    raise exception 'payment cannot be completed from its current status'
      using errcode = 'P0001';
  end if;

  update public.inbound_nail_tip_payments
  set
    status = 'paid',
    mstatus = p_mstatus,
    v_result_code = p_v_result_code,
    merr_msg = p_merr_msg,
    updated_at = now(),
    completed_at = now()
  where id = p_payment_id;

  update public.inbound_nail_tip_requests
  set
    payment_status = 'paid',
    status = 'paid'
  where id = v_request_id;

  if not found then
    raise exception 'inbound nail tip request was not found'
      using errcode = 'P0002';
  end if;

  return v_request_id;
end;
$$;


create or replace function public.record_inbound_nail_tip_payment_result(
  p_payment_id uuid,
  p_order_id text,
  p_status text,
  p_mstatus text,
  p_v_result_code text,
  p_merr_msg text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request_id uuid;
  v_stored_order_id text;
  v_current_status text;
begin
  if p_payment_id is null then
    raise exception 'payment_id is required'
      using errcode = '22023';
  end if;

  if p_order_id is null or btrim(p_order_id) = '' then
    raise exception 'order_id is required'
      using errcode = '22023';
  end if;

  if p_status not in ('pending', 'failed') then
    raise exception 'status must be pending or failed'
      using errcode = '22023';
  end if;

  select
    request_id,
    order_id,
    status
  into
    v_request_id,
    v_stored_order_id,
    v_current_status
  from public.inbound_nail_tip_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment was not found'
      using errcode = 'P0002';
  end if;

  if v_stored_order_id <> btrim(p_order_id) then
    raise exception 'order_id does not match'
      using errcode = '22023';
  end if;

  if v_current_status = 'paid' then
    raise exception 'paid payment cannot be changed'
      using errcode = 'P0001';
  end if;

  update public.inbound_nail_tip_payments
  set
    status = p_status,
    mstatus = p_mstatus,
    v_result_code = p_v_result_code,
    merr_msg = p_merr_msg,
    updated_at = now(),
    completed_at = case
      when p_status = 'failed' then now()
      else null
    end
  where id = p_payment_id;

  return v_request_id;
end;
$$;


revoke all on function public.create_inbound_nail_tip_payment(
  uuid,
  integer,
  text
) from public;

revoke all on function public.create_inbound_nail_tip_payment(
  uuid,
  integer,
  text
) from anon;

revoke all on function public.create_inbound_nail_tip_payment(
  uuid,
  integer,
  text
) from authenticated;

grant execute on function public.create_inbound_nail_tip_payment(
  uuid,
  integer,
  text
) to service_role;


revoke all on function public.complete_inbound_nail_tip_payment(
  uuid,
  text,
  text,
  text,
  text
) from public;

revoke all on function public.complete_inbound_nail_tip_payment(
  uuid,
  text,
  text,
  text,
  text
) from anon;

revoke all on function public.complete_inbound_nail_tip_payment(
  uuid,
  text,
  text,
  text,
  text
) from authenticated;

grant execute on function public.complete_inbound_nail_tip_payment(
  uuid,
  text,
  text,
  text,
  text
) to service_role;


revoke all on function public.record_inbound_nail_tip_payment_result(
  uuid,
  text,
  text,
  text,
  text,
  text
) from public;

revoke all on function public.record_inbound_nail_tip_payment_result(
  uuid,
  text,
  text,
  text,
  text,
  text
) from anon;

revoke all on function public.record_inbound_nail_tip_payment_result(
  uuid,
  text,
  text,
  text,
  text,
  text
) from authenticated;

grant execute on function public.record_inbound_nail_tip_payment_result(
  uuid,
  text,
  text,
  text,
  text,
  text
) to service_role;

commit;