begin;

alter table public.nail_tip_orders
  add column product_code text null,
  add column product_name_snapshot text null,
  add column product_price integer null,
  add column payment_link_token_hash text null;

alter table public.nail_tip_orders
  add constraint nail_tip_orders_product_code_not_blank_check
    check (
      product_code is null
      or btrim(product_code) <> ''
    ),
  add constraint nail_tip_orders_product_name_snapshot_not_blank_check
    check (
      product_name_snapshot is null
      or btrim(product_name_snapshot) <> ''
    ),
  add constraint nail_tip_orders_product_price_check
    check (
      product_price is null
      or product_price > 0
    ),
  add constraint nail_tip_orders_payment_link_token_hash_check
    check (
      payment_link_token_hash is null
      or payment_link_token_hash ~ '^[0-9a-f]{64}$'
    );

create unique index nail_tip_orders_payment_link_token_hash_key
  on public.nail_tip_orders (payment_link_token_hash)
  where payment_link_token_hash is not null;

comment on column public.nail_tip_orders.product_code is
  '注文時にサーバー側の商品マスタで検証した定額商品コード';

comment on column public.nail_tip_orders.product_name_snapshot is
  '注文時点の商品名スナップショット';

comment on column public.nail_tip_orders.product_price is
  '注文時にサーバー側の商品マスタで確定した税込決済金額';

comment on column public.nail_tip_orders.payment_link_token_hash is
  '顧客用決済リンクのランダムトークンをSHA-256でハッシュ化した値';

create table public.nail_tip_order_payments (
  id uuid primary key default gen_random_uuid(),
  nail_tip_order_id uuid not null,
  order_id text not null,
  amount integer not null,
  status text not null default 'processing',
  mstatus text null,
  v_result_code text null,
  merr_msg text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,

  constraint nail_tip_order_payments_nail_tip_order_id_fkey
    foreign key (nail_tip_order_id)
    references public.nail_tip_orders (id)
    on delete restrict,

  constraint nail_tip_order_payments_order_id_key
    unique (order_id),

  constraint nail_tip_order_payments_amount_check
    check (amount > 0),

  constraint nail_tip_order_payments_status_check
    check (
      status in (
        'processing',
        'pending',
        'paid',
        'failed'
      )
    ),

  constraint nail_tip_order_payments_order_id_not_blank_check
    check (btrim(order_id) <> '')
);

comment on table public.nail_tip_order_payments is
  'DGフィナンシャル／VeriTransによる定額ネイルチップ注文の決済処理履歴';

comment on column public.nail_tip_order_payments.nail_tip_order_id is
  '対象となる定額ネイルチップ注文ID';

comment on column public.nail_tip_order_payments.order_id is
  'VeriTransへ送信する一意の注文ID';

comment on column public.nail_tip_order_payments.amount is
  'nail_tip_orders.product_priceから取得した決済金額';

comment on column public.nail_tip_order_payments.status is
  'processing、pending、paid、failedのいずれか';

create unique index nail_tip_order_payments_one_active_per_order_idx
  on public.nail_tip_order_payments (nail_tip_order_id)
  where status in ('processing', 'pending', 'paid');

create index nail_tip_order_payments_nail_tip_order_id_idx
  on public.nail_tip_order_payments (nail_tip_order_id);

create index nail_tip_order_payments_created_at_idx
  on public.nail_tip_order_payments (created_at desc);

alter table public.nail_tip_order_payments
  enable row level security;

revoke all
  on table public.nail_tip_order_payments
  from public, anon, authenticated;

grant select, insert, update
  on table public.nail_tip_order_payments
  to service_role;

create or replace function public.prepare_nail_tip_order_payment_link(
  p_nail_tip_order_id uuid,
  p_payment_url text,
  p_payment_link_token_hash text,
  p_payment_due_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product_code text;
  v_product_price integer;
  v_payment_status text;
begin
  if p_nail_tip_order_id is null then
    raise exception 'nail_tip_order_id is required'
      using errcode = '22023';
  end if;

  if p_payment_url is null or btrim(p_payment_url) = '' then
    raise exception 'payment_url is required'
      using errcode = '22023';
  end if;

  if btrim(p_payment_url) !~ '^https://[^[:space:]]+$' then
    raise exception 'payment_url must be an https URL'
      using errcode = '22023';
  end if;

  if p_payment_link_token_hash is null
    or btrim(p_payment_link_token_hash) !~ '^[0-9a-fA-F]{64}$'
  then
    raise exception 'payment_link_token_hash must be a SHA-256 hex value'
      using errcode = '22023';
  end if;

  if p_payment_due_at is not null and p_payment_due_at <= now() then
    raise exception 'payment_due_at must be in the future'
      using errcode = '22023';
  end if;

  select
    product_code,
    product_price,
    payment_status
  into
    v_product_code,
    v_product_price,
    v_payment_status
  from public.nail_tip_orders
  where id = p_nail_tip_order_id
  for update;

  if not found then
    raise exception 'nail tip order was not found'
      using errcode = 'P0002';
  end if;

  if v_product_code is null or btrim(v_product_code) = '' then
    raise exception 'product_code is not set'
      using errcode = '22023';
  end if;

  if v_product_price is null or v_product_price <= 0 then
    raise exception 'product_price is not set'
      using errcode = '22023';
  end if;

  if v_payment_status = 'paid' then
    raise exception 'nail tip order is already paid'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.nail_tip_order_payments
    where nail_tip_order_id = p_nail_tip_order_id
      and status in ('processing', 'pending', 'paid')
  ) then
    raise exception 'an active payment already exists for this nail tip order'
      using errcode = 'P0001';
  end if;

  update public.nail_tip_orders
  set
    payment_url = btrim(p_payment_url),
    payment_link_token_hash = lower(btrim(p_payment_link_token_hash)),
    payment_due_at = p_payment_due_at,
    payment_status = 'payment_waiting'
  where id = p_nail_tip_order_id;

  return p_nail_tip_order_id;
end;
$$;

create or replace function public.create_nail_tip_order_payment(
  p_nail_tip_order_id uuid,
  p_veritrans_order_id text,
  p_payment_link_token_hash text
)
returns table (
  payment_id uuid,
  amount integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product_price integer;
  v_payment_status text;
  v_stored_token_hash text;
  v_payment_due_at timestamptz;
  v_payment_id uuid;
begin
  if p_nail_tip_order_id is null then
    raise exception 'nail_tip_order_id is required'
      using errcode = '22023';
  end if;

  if p_veritrans_order_id is null or btrim(p_veritrans_order_id) = '' then
    raise exception 'veritrans_order_id is required'
      using errcode = '22023';
  end if;

  if btrim(p_veritrans_order_id) !~ '^[A-Za-z0-9-]+$' then
    raise exception 'veritrans_order_id contains invalid characters'
      using errcode = '22023';
  end if;

  if p_payment_link_token_hash is null
    or btrim(p_payment_link_token_hash) !~ '^[0-9a-fA-F]{64}$'
  then
    raise exception 'payment_link_token_hash must be a SHA-256 hex value'
      using errcode = '22023';
  end if;

  select
    product_price,
    payment_status,
    payment_link_token_hash,
    payment_due_at
  into
    v_product_price,
    v_payment_status,
    v_stored_token_hash,
    v_payment_due_at
  from public.nail_tip_orders
  where id = p_nail_tip_order_id
  for update;

  if not found then
    raise exception 'nail tip order was not found'
      using errcode = 'P0002';
  end if;

  if v_stored_token_hash is null
    or v_stored_token_hash <> lower(btrim(p_payment_link_token_hash))
  then
    raise exception 'payment link token does not match'
      using errcode = 'P0001';
  end if;

  if v_payment_due_at is not null and v_payment_due_at <= now() then
    raise exception 'payment link has expired'
      using errcode = 'P0001';
  end if;

  if v_product_price is null or v_product_price <= 0 then
    raise exception 'product_price is not set'
      using errcode = '22023';
  end if;

  if v_payment_status = 'paid' then
    raise exception 'nail tip order is already paid'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.nail_tip_order_payments
    where nail_tip_order_id = p_nail_tip_order_id
      and status in ('processing', 'pending', 'paid')
  ) then
    raise exception 'an active payment already exists for this nail tip order'
      using errcode = 'P0001';
  end if;

  insert into public.nail_tip_order_payments (
    nail_tip_order_id,
    order_id,
    amount,
    status,
    created_at,
    updated_at
  )
  values (
    p_nail_tip_order_id,
    btrim(p_veritrans_order_id),
    v_product_price,
    'processing',
    now(),
    now()
  )
  returning id into v_payment_id;

  return query
  select v_payment_id, v_product_price;
end;
$$;

create or replace function public.complete_nail_tip_order_payment(
  p_payment_id uuid,
  p_veritrans_order_id text,
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
  v_nail_tip_order_id uuid;
  v_stored_order_id text;
  v_payment_status text;
begin
  if p_payment_id is null then
    raise exception 'payment_id is required'
      using errcode = '22023';
  end if;

  if p_veritrans_order_id is null or btrim(p_veritrans_order_id) = '' then
    raise exception 'veritrans_order_id is required'
      using errcode = '22023';
  end if;

  if p_mstatus is null or btrim(p_mstatus) <> 'success' then
    raise exception 'mstatus must be success'
      using errcode = '22023';
  end if;

  if p_v_result_code is null
    or btrim(p_v_result_code) <> 'A001000000000000'
  then
    raise exception 'v_result_code is not the dummy Card Authorize success code'
      using errcode = '22023';
  end if;

  select
    nail_tip_order_id,
    order_id,
    status
  into
    v_nail_tip_order_id,
    v_stored_order_id,
    v_payment_status
  from public.nail_tip_order_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment was not found'
      using errcode = 'P0002';
  end if;

  if v_stored_order_id <> btrim(p_veritrans_order_id) then
    raise exception 'veritrans_order_id does not match'
      using errcode = '22023';
  end if;

  if v_payment_status = 'paid' then
    return v_nail_tip_order_id;
  end if;

  if v_payment_status not in ('processing', 'pending') then
    raise exception 'payment cannot be completed from its current status'
      using errcode = 'P0001';
  end if;

  update public.nail_tip_order_payments
  set
    status = 'paid',
    mstatus = btrim(p_mstatus),
    v_result_code = btrim(p_v_result_code),
    merr_msg = p_merr_msg,
    updated_at = now(),
    completed_at = now()
  where id = p_payment_id;

  update public.nail_tip_orders
  set
    payment_status = 'paid',
    payment_transaction_id = btrim(p_veritrans_order_id),
    paid_at = now()
  where id = v_nail_tip_order_id;

  if not found then
    raise exception 'nail tip order was not found'
      using errcode = 'P0002';
  end if;

  return v_nail_tip_order_id;
end;
$$;

create or replace function public.record_nail_tip_order_payment_result(
  p_payment_id uuid,
  p_veritrans_order_id text,
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
  v_nail_tip_order_id uuid;
  v_stored_order_id text;
  v_current_status text;
begin
  if p_payment_id is null then
    raise exception 'payment_id is required'
      using errcode = '22023';
  end if;

  if p_veritrans_order_id is null or btrim(p_veritrans_order_id) = '' then
    raise exception 'veritrans_order_id is required'
      using errcode = '22023';
  end if;

  if p_status not in ('pending', 'failed') then
    raise exception 'status must be pending or failed'
      using errcode = '22023';
  end if;

  select
    nail_tip_order_id,
    order_id,
    status
  into
    v_nail_tip_order_id,
    v_stored_order_id,
    v_current_status
  from public.nail_tip_order_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment was not found'
      using errcode = 'P0002';
  end if;

  if v_stored_order_id <> btrim(p_veritrans_order_id) then
    raise exception 'veritrans_order_id does not match'
      using errcode = '22023';
  end if;

  if v_current_status = 'paid' then
    raise exception 'paid payment cannot be changed'
      using errcode = 'P0001';
  end if;

  update public.nail_tip_order_payments
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

  return v_nail_tip_order_id;
end;
$$;

revoke all on function public.prepare_nail_tip_order_payment_link(
  uuid,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.prepare_nail_tip_order_payment_link(
  uuid,
  text,
  text,
  timestamptz
) to service_role;

revoke all on function public.create_nail_tip_order_payment(
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_nail_tip_order_payment(
  uuid,
  text,
  text
) to service_role;

revoke all on function public.complete_nail_tip_order_payment(
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.complete_nail_tip_order_payment(
  uuid,
  text,
  text,
  text,
  text
) to service_role;

revoke all on function public.record_nail_tip_order_payment_result(
  uuid,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.record_nail_tip_order_payment_result(
  uuid,
  text,
  text,
  text,
  text,
  text
) to service_role;

commit;
