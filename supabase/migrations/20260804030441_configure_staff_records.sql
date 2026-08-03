begin;

do $$
declare
  target_salon_id constant uuid := 'e120ed90-fded-41b8-b3fe-f486e84f2418';
  target_a_id constant uuid := 'd1f29ea0-1217-4d79-bcbc-771b597b00ad';
  target_b_id constant uuid := '1fabcdec-c515-462a-b2e2-513b2cd24d5a';
  target_c_id constant uuid := '596dc729-176f-4fbc-8751-6812ca04994f';
  target_d_id constant uuid := '8b9f918d-aa1f-4a5d-862d-8250d5ff181d';
  affected_rows integer;
  existing_row public.staffs%rowtype;
begin
  if not exists (
    select 1
    from public.salons
    where id = target_salon_id
      and name = 'Aily Nail Studio'
      and status = 'active'
  ) then
    raise exception
      'Expected active Aily Nail Studio salon row was not found';
  end if;

  select *
  into existing_row
  from public.staffs
  where id = target_b_id;

  if not found
    or existing_row.name is distinct from 'まりな'
    or existing_row.salon_id is distinct from target_salon_id
    or existing_row.role not in ('staff')
       and existing_row.role is not null
    or existing_row.customer_booking_enabled is distinct from true
  then
    raise exception
      'Target B row is missing or differs from the verified state';
  end if;

  select *
  into existing_row
  from public.staffs
  where id = target_c_id;

  if not found
    or existing_row.name is distinct from 'ほのか'
    or existing_row.salon_id is not null
       and existing_row.salon_id is distinct from target_salon_id
    or existing_row.role not in ('staff')
       and existing_row.role is not null
    or existing_row.customer_booking_enabled is distinct from false
  then
    raise exception
      'Target C row is missing or differs from the verified state';
  end if;

  select *
  into existing_row
  from public.staffs
  where id = target_d_id;

  if not found
    or existing_row.name is distinct from 'あかね'
    or existing_row.salon_id is distinct from target_salon_id
    or existing_row.role not in ('staff')
       and existing_row.role is not null
    or existing_row.customer_booking_enabled is distinct from false
  then
    raise exception
      'Target D row is missing or differs from the verified state';
  end if;

  select *
  into existing_row
  from public.staffs
  where id = target_a_id;

  if found then
    if existing_row.name is distinct from '襖田匡隆'
      or existing_row.salon_id is distinct from target_salon_id
      or existing_row.role is distinct from 'owner'
      or existing_row.is_active is distinct from true
      or existing_row.customer_booking_enabled is distinct from false
    then
      raise exception
        'Target A id already exists with an unexpected definition';
    end if;
  else
    if exists (
      select 1
      from public.staffs
      where regexp_replace(
        coalesce(name, ''),
        '[[:space:]　]+',
        '',
        'g'
      ) = '襖田匡隆'
    ) then
      raise exception
        'A possible Target A row already exists under another id';
    end if;

    insert into public.staffs (
      id,
      salon_id,
      name,
      role,
      user_id,
      customer_booking_enabled,
      is_active
    ) values (
      target_a_id,
      target_salon_id,
      '襖田匡隆',
      'owner',
      null,
      false,
      true
    );
  end if;

  update public.staffs
  set
    role = 'staff',
    is_active = true,
    customer_booking_enabled = true
  where id = target_b_id
    and name = 'まりな'
    and salon_id = target_salon_id
    and (role is null or role = 'staff')
    and customer_booking_enabled = true;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Target B update affected % rows', affected_rows;
  end if;

  update public.staffs
  set
    salon_id = target_salon_id,
    role = 'staff',
    is_active = true,
    customer_booking_enabled = false
  where id = target_c_id
    and name = 'ほのか'
    and (salon_id is null or salon_id = target_salon_id)
    and (role is null or role = 'staff')
    and customer_booking_enabled = false;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Target C update affected % rows', affected_rows;
  end if;

  update public.staffs
  set
    role = 'staff',
    is_active = true,
    customer_booking_enabled = false
  where id = target_d_id
    and name = 'あかね'
    and salon_id = target_salon_id
    and (role is null or role = 'staff')
    and customer_booking_enabled = false;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Target D update affected % rows', affected_rows;
  end if;

  if (
    select count(*)
    from public.staffs
    where id in (target_a_id, target_b_id, target_c_id, target_d_id)
      and salon_id = target_salon_id
      and is_active = true
      and (
        (id = target_a_id
          and role = 'owner'
          and customer_booking_enabled = false)
        or
        (id = target_b_id
          and role = 'staff'
          and customer_booking_enabled = true)
        or
        (id in (target_c_id, target_d_id)
          and role = 'staff'
          and customer_booking_enabled = false)
      )
  ) <> 4 then
    raise exception 'Final staff configuration verification failed';
  end if;
end
$$;

commit;

-- This migration intentionally does not create or invite Auth users and does
-- not populate staffs.user_id, email, or phone. Run it before Auth linkage.
-- If a rollback is required after commit, prepare a separately reviewed SQL
-- that targets these same four primary keys. Delete Target A only while its
-- user_id remains null, and restore Targets B-D to the values verified before
-- this migration. Do not use names alone as rollback predicates.
