begin;

alter table public.staffs
  add column if not exists customer_booking_enabled boolean not null default false;

comment on column public.staffs.customer_booking_enabled is
  'Whether the staff member can accept general customer bookings.';

do $$
begin
  if not exists (
    select 1 from public.staffs
    where id = '1fabcdec-c515-462a-b2e2-513b2cd24d5a'::uuid
  ) then
    raise exception 'Expected customer-booking staff record was not found.';
  end if;

  if not exists (
    select 1 from public.staffs
    where id = '596dc729-176f-4fbc-8751-6812ca04994f'::uuid
  ) then
    raise exception 'Expected junior staff record was not found.';
  end if;

  if not exists (
    select 1 from public.staffs
    where id = '8b9f918d-aa1f-4a5d-862d-8250d5ff181d'::uuid
  ) then
    raise exception 'Expected retired staff record was not found.';
  end if;
end
$$;

update public.staffs
set customer_booking_enabled = case id
  when '1fabcdec-c515-462a-b2e2-513b2cd24d5a'::uuid then true
  when '596dc729-176f-4fbc-8751-6812ca04994f'::uuid then false
  when '8b9f918d-aa1f-4a5d-862d-8250d5ff181d'::uuid then false
  else customer_booking_enabled
end
where id in (
  '1fabcdec-c515-462a-b2e2-513b2cd24d5a'::uuid,
  '596dc729-176f-4fbc-8751-6812ca04994f'::uuid,
  '8b9f918d-aa1f-4a5d-862d-8250d5ff181d'::uuid
);

commit;
