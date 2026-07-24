begin;

alter table public.staffs
  add column if not exists is_active boolean not null default false;

do $$
declare
  is_active_type text;
  is_active_not_null boolean;
  is_active_default text;
begin
  select
    format_type(a.atttypid, a.atttypmod),
    a.attnotnull,
    pg_get_expr(d.adbin, d.adrelid)
  into
    is_active_type,
    is_active_not_null,
    is_active_default
  from pg_attribute a
  left join pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where a.attrelid = 'public.staffs'::regclass
    and a.attname = 'is_active'
    and not a.attisdropped;

  if is_active_type is distinct from 'boolean'
    or is_active_not_null is distinct from true
    or is_active_default is distinct from 'false'
  then
    raise exception
      'public.staffs.is_active exists with an unexpected definition';
  end if;
end
$$;

do $$
declare
  staffs_user_id_attnum smallint;
  auth_users_id_attnum smallint;
  named_constraint record;
  equivalent_constraint_exists boolean;
begin
  select attnum
  into staffs_user_id_attnum
  from pg_attribute
  where attrelid = 'public.staffs'::regclass
    and attname = 'user_id'
    and not attisdropped;

  select attnum
  into auth_users_id_attnum
  from pg_attribute
  where attrelid = 'auth.users'::regclass
    and attname = 'id'
    and not attisdropped;

  if staffs_user_id_attnum is null or auth_users_id_attnum is null then
    raise exception
      'Required columns public.staffs.user_id or auth.users.id were not found';
  end if;

  select
    c.contype,
    c.conkey,
    c.confrelid,
    c.confkey,
    c.confdeltype
  into named_constraint
  from pg_constraint c
  where c.conrelid = 'public.staffs'::regclass
    and c.conname = 'staffs_user_id_fkey';

  if found then
    if named_constraint.contype <> 'f'
      or named_constraint.conkey <> array[staffs_user_id_attnum]::smallint[]
      or named_constraint.confrelid <> 'auth.users'::regclass
      or named_constraint.confkey <> array[auth_users_id_attnum]::smallint[]
      or named_constraint.confdeltype <> 'n'
    then
      raise exception
        'Constraint staffs_user_id_fkey exists with an unexpected definition';
    end if;
  else
    select exists (
      select 1
      from pg_constraint c
      where c.conrelid = 'public.staffs'::regclass
        and c.contype = 'f'
        and c.conkey = array[staffs_user_id_attnum]::smallint[]
        and c.confrelid = 'auth.users'::regclass
        and c.confkey = array[auth_users_id_attnum]::smallint[]
        and c.confdeltype = 'n'
    )
    into equivalent_constraint_exists;

    if not equivalent_constraint_exists then
      alter table public.staffs
        add constraint staffs_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete set null;
    end if;
  end if;
end
$$;

do $$
declare
  user_id_attnum smallint;
  named_index record;
  equivalent_index_exists boolean;
begin
  select attnum
  into user_id_attnum
  from pg_attribute
  where attrelid = 'public.staffs'::regclass
    and attname = 'user_id'
    and not attisdropped;

  if user_id_attnum is null then
    raise exception 'Required column public.staffs.user_id was not found';
  end if;

  select
    i.indrelid,
    i.indisunique,
    i.indisvalid,
    i.indnkeyatts,
    i.indkey[0] as first_key_attnum,
    i.indexprs,
    regexp_replace(
      coalesce(pg_get_expr(i.indpred, i.indrelid), ''),
      '[[:space:]()]',
      '',
      'g'
    ) as normalized_predicate
  into named_index
  from pg_class index_class
  join pg_namespace index_namespace
    on index_namespace.oid = index_class.relnamespace
  join pg_index i
    on i.indexrelid = index_class.oid
  where index_namespace.nspname = 'public'
    and index_class.relname = 'staffs_user_id_unique_idx';

  if found then
    if named_index.indrelid <> 'public.staffs'::regclass
      or not named_index.indisunique
      or not named_index.indisvalid
      or named_index.indnkeyatts <> 1
      or named_index.first_key_attnum <> user_id_attnum
      or named_index.indexprs is not null
      or named_index.normalized_predicate <> 'user_idISNOTNULL'
    then
      raise exception
        'Index staffs_user_id_unique_idx exists with an unexpected definition';
    end if;
  else
    select exists (
      select 1
      from pg_index i
      where i.indrelid = 'public.staffs'::regclass
        and i.indisunique
        and i.indisvalid
        and i.indnkeyatts = 1
        and i.indkey[0] = user_id_attnum
        and i.indexprs is null
        and regexp_replace(
          coalesce(pg_get_expr(i.indpred, i.indrelid), ''),
          '[[:space:]()]',
          '',
          'g'
        ) = 'user_idISNOTNULL'
    )
    into equivalent_index_exists;

    if not equivalent_index_exists then
      create unique index staffs_user_id_unique_idx
        on public.staffs (user_id)
        where user_id is not null;
    end if;
  end if;
end
$$;

do $$
declare
  named_constraint_definition text;
  normalized_named_definition text;
  equivalent_constraint_exists boolean;
  expected_definition text :=
    'CHECK (role IS NULL OR role = ANY (ARRAY[''owner''::text, ''staff''::text]))';
  alternate_definition text :=
    'CHECK (role = ANY (ARRAY[''owner''::text, ''staff''::text]))';
begin
  select pg_get_constraintdef(c.oid, true)
  into named_constraint_definition
  from pg_constraint c
  where c.conrelid = 'public.staffs'::regclass
    and c.conname = 'staffs_role_check';

  normalized_named_definition := regexp_replace(
    coalesce(named_constraint_definition, ''),
    '[[:space:]()]',
    '',
    'g'
  );

  if named_constraint_definition is not null then
    if normalized_named_definition not in (
      regexp_replace(expected_definition, '[[:space:]()]', '', 'g'),
      regexp_replace(alternate_definition, '[[:space:]()]', '', 'g')
    ) then
      raise exception
        'Constraint staffs_role_check exists with an unexpected definition';
    end if;
  else
    select exists (
      select 1
      from pg_constraint c
      where c.conrelid = 'public.staffs'::regclass
        and c.contype = 'c'
        and regexp_replace(
          pg_get_constraintdef(c.oid, true),
          '[[:space:]()]',
          '',
          'g'
        ) in (
          regexp_replace(expected_definition, '[[:space:]()]', '', 'g'),
          regexp_replace(alternate_definition, '[[:space:]()]', '', 'g')
        )
    )
    into equivalent_constraint_exists;

    if not equivalent_constraint_exists then
      alter table public.staffs
        add constraint staffs_role_check
        check (role is null or role in ('owner', 'staff'));
    end if;
  end if;
end
$$;

do $$
declare
  salon_id_attnum smallint;
  named_index record;
  equivalent_index_exists boolean;
begin
  select attnum
  into salon_id_attnum
  from pg_attribute
  where attrelid = 'public.staffs'::regclass
    and attname = 'salon_id'
    and not attisdropped;

  if salon_id_attnum is null then
    raise exception 'Required column public.staffs.salon_id was not found';
  end if;

  select
    i.indrelid,
    i.indisunique,
    i.indisvalid,
    i.indnkeyatts,
    i.indkey[0] as first_key_attnum,
    i.indexprs,
    i.indpred,
    access_method.amname
  into named_index
  from pg_class index_class
  join pg_namespace index_namespace
    on index_namespace.oid = index_class.relnamespace
  join pg_index i
    on i.indexrelid = index_class.oid
  join pg_am access_method
    on access_method.oid = index_class.relam
  where index_namespace.nspname = 'public'
    and index_class.relname = 'staffs_salon_id_idx';

  if found then
    if named_index.indrelid <> 'public.staffs'::regclass
      or named_index.indisunique
      or not named_index.indisvalid
      or named_index.indnkeyatts <> 1
      or named_index.first_key_attnum <> salon_id_attnum
      or named_index.indexprs is not null
      or named_index.indpred is not null
      or named_index.amname <> 'btree'
    then
      raise exception
        'Index staffs_salon_id_idx exists with an unexpected definition';
    end if;
  else
    select exists (
      select 1
      from pg_index i
      join pg_class index_class
        on index_class.oid = i.indexrelid
      join pg_am access_method
        on access_method.oid = index_class.relam
      where i.indrelid = 'public.staffs'::regclass
        and i.indisvalid
        and i.indnkeyatts = 1
        and i.indkey[0] = salon_id_attnum
        and i.indexprs is null
        and i.indpred is null
        and access_method.amname = 'btree'
    )
    into equivalent_index_exists;

    if not equivalent_index_exists then
      create index staffs_salon_id_idx
        on public.staffs (salon_id);
    end if;
  end if;
end
$$;

comment on column public.staffs.is_active is
  'Whether the staff member is active and allowed to sign in. This setting is independent of customer_booking_enabled.';

comment on column public.staffs.customer_booking_enabled is
  'Whether the staff member appears as a candidate for customer-facing bookings. This setting is independent of is_active and must not be used as a sign-in permission.';

comment on column public.staffs.user_id is
  'One-to-one link to the staff member''s Supabase Auth user.';

comment on column public.staffs.role is
  'Application authorization role for the staff member. Allowed values are owner, staff, or null while unconfigured.';

commit;
