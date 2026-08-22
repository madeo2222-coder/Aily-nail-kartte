begin;

create function public.register_staff_visit(
  p_operator_staff_id uuid,
  p_salon_id uuid,
  p_reservation_id uuid,
  p_customer_id uuid,
  p_staff_id uuid,
  p_visit_date date,
  p_menu_name text,
  p_color text,
  p_price integer,
  p_memo text,
  p_next_visit_date date,
  p_next_proposal text,
  p_payments jsonb
)
returns table (
  visit_id uuid,
  reservation_id uuid,
  staff_id uuid,
  customer_id uuid,
  price integer,
  paid_amount numeric
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_assigned_staff_id uuid;
  v_assigned_staff_name text;
  v_reservation_customer_id uuid;
  v_reservation_staff_id uuid;
  v_reservation_status text;
  v_visit_id uuid;
  v_visit_count bigint;
  v_payment_count integer;
  v_payment_total numeric;
  v_discount_total numeric;
  v_main_payment_method text;
  v_affected_rows integer;
begin
  if p_operator_staff_id is null or p_salon_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_INVALID_OPERATOR';
  end if;

  perform 1
  from public.staffs as operator_staff
  where operator_staff.id = p_operator_staff_id
    and operator_staff.salon_id = p_salon_id
    and operator_staff.is_active is true
    and operator_staff.role in ('owner', 'staff')
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_INVALID_OPERATOR';
  end if;

  if p_customer_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_INVALID_CUSTOMER';
  end if;

  perform 1
  from public.customers as customer
  where customer.id = p_customer_id
    and customer.salon_id = p_salon_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_INVALID_CUSTOMER';
  end if;

  if p_reservation_id is not null then
    if p_staff_id is not null then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_INVALID_STAFF';
    end if;

    select
      reservation.customer_id,
      reservation.staff_id,
      reservation.status
    into
      v_reservation_customer_id,
      v_reservation_staff_id,
      v_reservation_status
    from public.reservations as reservation
    where reservation.id = p_reservation_id
      and reservation.salon_id = p_salon_id
    for update;

    if not found
      or v_reservation_customer_id is null
      or v_reservation_staff_id is null
      or v_reservation_customer_id <> p_customer_id
    then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_INVALID_RESERVATION';
    end if;

    if v_reservation_status in ('完了', 'completed') then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_RESERVATION_ALREADY_COMPLETED';
    end if;

    if v_reservation_status is null
      or v_reservation_status not in ('confirmed', '予約確定')
    then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_INVALID_RESERVATION';
    end if;

    if exists (
      select 1
      from public.visits as existing_visit
      where existing_visit.reservation_id = p_reservation_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_ALREADY_EXISTS';
    end if;

    v_assigned_staff_id := v_reservation_staff_id;
  else
    if p_staff_id is null then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_INVALID_STAFF';
    end if;

    v_assigned_staff_id := p_staff_id;
  end if;

  select nullif(btrim(assigned_staff.name), '')
  into v_assigned_staff_name
  from public.staffs as assigned_staff
  where assigned_staff.id = v_assigned_staff_id
    and assigned_staff.salon_id = p_salon_id
    and assigned_staff.is_active is true
    and assigned_staff.role = 'staff'
  for share;

  if not found or v_assigned_staff_name is null then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_INVALID_STAFF';
  end if;

  if p_visit_date is null or p_price is null or p_price < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_INVALID_INPUT';
  end if;

  if p_payments is null
    or jsonb_typeof(p_payments) is distinct from 'array'
    or jsonb_array_length(p_payments) = 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_INVALID_PAYMENT';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payments) as payment(value)
    where jsonb_typeof(payment.value) is distinct from 'object'
      or jsonb_typeof(payment.value -> 'method') is distinct from 'string'
      or jsonb_typeof(payment.value -> 'amount') is distinct from 'number'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_INVALID_PAYMENT';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payments) as payment(value)
    where btrim(payment.value ->> 'method') not in (
        '現金',
        'クレジットカード',
        'PayPay',
        '交通系IC',
        'iD',
        'QUICPay',
        '楽天Edy',
        'WAON',
        'nanaco',
        'UnionPay（銀聯）',
        'Discover',
        'ホットペッパーポイント',
        '割引',
        'その他'
      )
      or (payment.value ->> 'amount')::numeric
        <> trunc((payment.value ->> 'amount')::numeric)
      or (btrim(payment.value ->> 'method') = '割引'
        and (payment.value ->> 'amount')::numeric >= 0)
      or (btrim(payment.value ->> 'method') <> '割引'
        and (payment.value ->> 'amount')::numeric <= 0)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_INVALID_PAYMENT';
  end if;

  select
    count(*)::integer,
    coalesce(
      sum((payment.value ->> 'amount')::numeric),
      0
    ),
    coalesce(
      sum(
        case
          when btrim(payment.value ->> 'method') = '割引'
            then abs((payment.value ->> 'amount')::numeric)
          else 0
        end
      ),
      0
    )
  into
    v_payment_count,
    v_payment_total,
    v_discount_total
  from jsonb_array_elements(p_payments) as payment(value);

  if v_payment_total <> p_price::numeric then
    raise exception using
      errcode = 'P0001',
      message = 'VISIT_PAYMENT_TOTAL_MISMATCH';
  end if;

  if v_payment_count = 1 then
    v_main_payment_method := btrim(p_payments -> 0 ->> 'method');
  else
    v_main_payment_method := '複数';
  end if;

  insert into public.visits (
    customer_id,
    salon_id,
    reservation_id,
    staff_id,
    staff_name,
    visit_date,
    menu_name,
    menu,
    color,
    price,
    payment_method,
    payment_status,
    paid_amount,
    unpaid_amount,
    memo,
    next_visit_date,
    next_proposal
  )
  values (
    p_customer_id,
    p_salon_id,
    p_reservation_id,
    v_assigned_staff_id,
    v_assigned_staff_name,
    p_visit_date,
    nullif(btrim(p_menu_name), ''),
    nullif(btrim(p_menu_name), ''),
    nullif(btrim(p_color), ''),
    p_price,
    v_main_payment_method,
    'paid',
    p_price,
    0,
    nullif(btrim(p_memo), ''),
    p_next_visit_date,
    nullif(btrim(p_next_proposal), '')
  )
  returning id into v_visit_id;

  select count(*)
  into v_visit_count
  from public.visits as customer_visit
  where customer_visit.customer_id = p_customer_id;

  if v_visit_count % 12 = 0 then
    update public.customers as customer
    set coupon_1000_count = coalesce(customer.coupon_1000_count, 0) + 1
    where customer.id = p_customer_id
      and customer.salon_id = p_salon_id;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_INVALID_CUSTOMER';
    end if;

    insert into public.coupon_histories (
      customer_id,
      visit_id,
      coupon_type,
      action,
      amount,
      note
    )
    values (
      p_customer_id,
      v_visit_id,
      'coupon_1000',
      'earned',
      1000,
      '12回来店達成'
    );
  elsif v_visit_count % 6 = 0 then
    update public.customers as customer
    set coupon_500_count = coalesce(customer.coupon_500_count, 0) + 1
    where customer.id = p_customer_id
      and customer.salon_id = p_salon_id;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_INVALID_CUSTOMER';
    end if;

    insert into public.coupon_histories (
      customer_id,
      visit_id,
      coupon_type,
      action,
      amount,
      note
    )
    values (
      p_customer_id,
      v_visit_id,
      'coupon_500',
      'earned',
      500,
      '6回来店達成'
    );
  end if;

  insert into public.visit_payments (
    visit_id,
    payment_method,
    amount,
    sort_order
  )
  select
    v_visit_id,
    btrim(payment.value ->> 'method'),
    (payment.value ->> 'amount')::numeric,
    payment.ordinality::integer
  from jsonb_array_elements(p_payments) with ordinality as payment(value, ordinality);

  if v_discount_total >= 1000 then
    update public.customers as customer
    set coupon_1000_count = customer.coupon_1000_count - 1
    where customer.id = p_customer_id
      and customer.salon_id = p_salon_id
      and customer.coupon_1000_count > 0;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_COUPON_INSUFFICIENT';
    end if;

    insert into public.coupon_histories (
      customer_id,
      visit_id,
      coupon_type,
      action,
      amount,
      note
    )
    values (
      p_customer_id,
      v_visit_id,
      'coupon_1000',
      'used',
      -1000,
      '会計時利用'
    );
  elsif v_discount_total >= 500 then
    update public.customers as customer
    set coupon_500_count = customer.coupon_500_count - 1
    where customer.id = p_customer_id
      and customer.salon_id = p_salon_id
      and customer.coupon_500_count > 0;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_COUPON_INSUFFICIENT';
    end if;

    insert into public.coupon_histories (
      customer_id,
      visit_id,
      coupon_type,
      action,
      amount,
      note
    )
    values (
      p_customer_id,
      v_visit_id,
      'coupon_500',
      'used',
      -500,
      '会計時利用'
    );
  end if;

  if p_reservation_id is not null then
    update public.reservations as reservation
    set status = '完了'
    where reservation.id = p_reservation_id
      and reservation.salon_id = p_salon_id
      and reservation.status in ('confirmed', '予約確定');

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'VISIT_RESERVATION_UPDATE_FAILED';
    end if;
  end if;

  return query
  select
    v_visit_id,
    p_reservation_id,
    v_assigned_staff_id,
    p_customer_id,
    p_price,
    p_price::numeric;
end;
$function$;

revoke execute on function public.register_staff_visit(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  integer,
  text,
  date,
  text,
  jsonb
) from public;

revoke execute on function public.register_staff_visit(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  integer,
  text,
  date,
  text,
  jsonb
) from anon;

revoke execute on function public.register_staff_visit(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  integer,
  text,
  date,
  text,
  jsonb
) from authenticated;

grant execute on function public.register_staff_visit(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  integer,
  text,
  date,
  text,
  jsonb
) to service_role;

comment on function public.register_staff_visit(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  integer,
  text,
  date,
  text,
  jsonb
) is
  '個別Authで確認済みのstaff APIからのみ呼び出し、来店・支払・クーポン・予約完了を1 transactionで登録する。写真は対象外。';

commit;
