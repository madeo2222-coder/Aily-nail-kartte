begin;

do $$
declare
  target_salon_id uuid;
  target_salon_count integer;
  retired_staff_count integer;
  contractor_count integer;
begin
  select count(*)
  into target_salon_count
  from public.salons
  where name = 'Aily Nail Studio'
    and status = 'active';

  if target_salon_count <> 1 then
    raise exception 'Expected exactly one active Aily Nail Studio salon row, found %', target_salon_count;
  end if;

  select id
  into target_salon_id
  from public.salons
  where name = 'Aily Nail Studio'
    and status = 'active';

  update public.staffs
  set
    is_active = false,
    customer_booking_enabled = false
  where salon_id = target_salon_id
    and name = 'あかね';

  get diagnostics retired_staff_count = row_count;
  if retired_staff_count <> 1 then
    raise exception 'Expected exactly one retired staff row for あかね, found %', retired_staff_count;
  end if;

  select count(*)
  into contractor_count
  from public.staffs
  where salon_id = target_salon_id
    and name = '業務委託';

  if contractor_count = 0 then
    insert into public.staffs (
      salon_id,
      name,
      role,
      user_id,
      customer_booking_enabled,
      is_active
    ) values (
      target_salon_id,
      '業務委託',
      'staff',
      null,
      false,
      true
    );
  elsif contractor_count > 1 then
    raise exception 'Multiple 業務委託 staff rows exist for Aily Nail Studio';
  end if;
end
$$;

commit;
