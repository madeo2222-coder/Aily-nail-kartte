begin;

alter table public.staffs
  add constraint staffs_id_salon_id_key
  unique (id, salon_id);

alter table public.visits
  add column staff_id uuid null,
  add column reservation_id uuid null;

alter table public.visits
  add constraint visits_staff_requires_salon_check
  check (
    staff_id is null
    or salon_id is not null
  );

alter table public.visits
  add constraint visits_staff_salon_fkey
  foreign key (staff_id, salon_id)
  references public.staffs (id, salon_id)
  on update restrict
  on delete restrict;

alter table public.visits
  add constraint visits_reservation_id_fkey
  foreign key (reservation_id)
  references public.reservations (id)
  on update restrict
  on delete set null;

create index visits_staff_id_idx
  on public.visits (staff_id);

create index visits_reservation_id_idx
  on public.visits (reservation_id);

create index visits_salon_staff_visit_date_idx
  on public.visits (salon_id, staff_id, visit_date);

comment on column public.visits.staff_id is
  '給与・スタッフ別売上集計に使用する施術担当staffs.id。staff_nameではなくこの列を集計の正本とする。';

comment on column public.visits.reservation_id is
  '来店の起点となった予約。予約なし来店ではNULL。';

comment on column public.visits.staff_name is
  '来店登録時点の担当者表示名snapshot。認可・給与・スタッフ別売上集計の正本には使用しない。';

commit;
