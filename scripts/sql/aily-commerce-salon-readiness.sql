-- Read-only production readiness check for commerce tenant scoping.
-- Returns counts only; it does not return customer, staff, order, or salon rows.

with linked_owner_salons as (
  select distinct salon_id
  from public.staffs
  where is_active is true
    and role = 'owner'
    and user_id is not null
    and salon_id is not null
),
domestic_orders as (
  select
    count(*) as total_count,
    count(*) filter (where salon_id is null) as unassigned_count,
    count(*) filter (
      where salon_id in (select salon_id from linked_owner_salons)
    ) as linked_owner_salon_count
  from public.nail_tip_orders
),
inbound_schema as (
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inbound_nail_tip_requests'
      and column_name = 'salon_id'
      and data_type = 'uuid'
  ) as has_uuid_salon_id
),
inbound_requests as (
  select count(*) as total_count
  from public.inbound_nail_tip_requests
)
select
  (select count(*) from linked_owner_salons) as linked_owner_salon_count,
  domestic_orders.total_count as domestic_order_count,
  domestic_orders.unassigned_count as domestic_order_unassigned_count,
  domestic_orders.linked_owner_salon_count as domestic_order_linked_owner_salon_count,
  inbound_requests.total_count as inbound_request_count,
  inbound_schema.has_uuid_salon_id as inbound_has_uuid_salon_id
from domestic_orders
cross join inbound_schema
cross join inbound_requests;
