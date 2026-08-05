-- Masa birleştirme (Gökhan, 2026-08-05: "rezervasyon on kişi kapasite dolana kadar masa
-- seçecek, mesela yan yana 3 masayı birleştirdi... rezervasyon öyle tamamlanacak").
-- Bir rezervasyonun birden fazla masaya bağlanabilmesi için — reservations.table_id
-- geriye dönük uyumluluk için "birincil" masa olarak kalmaya devam ediyor (ör. seat_reservation
-- p_table_id ile çağrılıyor), ama gerçek kaynak artık bu tablo.
create table reservation_tables (
  id            uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  table_id      uuid not null references restaurant_tables(id),
  created_at    timestamptz not null default now(),
  unique (reservation_id, table_id)
);
create index idx_reservation_tables_reservation on reservation_tables(reservation_id);
create index idx_reservation_tables_table on reservation_tables(table_id);

-- Var olan tek-masalı rezervasyonları geriye dönük doldur.
insert into reservation_tables (reservation_id, table_id)
select id, table_id from reservations where table_id is not null and deleted_at is null
on conflict do nothing;

-- Birden fazla masa seçilerek atama — eski assign_reservation_table'ın yerine geçiyor.
create or replace function assign_reservation_tables(p_reservation_id uuid, p_table_ids uuid[])
returns void
language plpgsql
as $$
declare
  v_rest uuid;
  v_name text;
  v_party int;
  v_saat text;
  v_note text;
begin
  if p_table_ids is null or array_length(p_table_ids, 1) is null or array_length(p_table_ids, 1) = 0 then
    raise exception 'En az bir masa seçilmeli';
  end if;

  select restaurant_id, guest_name, party_size, to_char(reserved_at at time zone 'Europe/Istanbul', 'HH24:MI')
  into v_rest, v_name, v_party, v_saat
  from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  update restaurant_tables rt
  set status = 'empty', reservation_note = null
  where rt.status = 'reserved'
    and rt.id in (select table_id from reservation_tables where reservation_id = p_reservation_id)
    and rt.id <> all (p_table_ids);

  delete from reservation_tables where reservation_id = p_reservation_id;
  insert into reservation_tables (reservation_id, table_id)
  select p_reservation_id, t from unnest(p_table_ids) as t;

  update reservations set table_id = p_table_ids[1] where id = p_reservation_id;

  v_note := v_saat || ' · ' || v_name || ' · ' || v_party || ' kişi';
  update restaurant_tables
  set status = 'reserved', reservation_note = v_note
  where id = any (p_table_ids) and restaurant_id = v_rest and status = 'empty';
end;
$$;

-- seat_reservation/end_reservation_visit/set_reservation_status artık reservation_tables'taki
-- TÜM masaları işletiyor, sadece tekini değil.
create or replace function seat_reservation(p_reservation_id uuid, p_table_id uuid, p_staff_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_rest uuid;
  v_guest_name text;
  v_masa_id uuid;
begin
  select restaurant_id, guest_name into v_rest, v_guest_name
  from reservations where id = p_reservation_id and status in ('bekleniyor', 'geldi');
  if not found then
    raise exception 'Rezervasyon bulunamadı ya da zaten oturmuş/iptal edilmiş';
  end if;

  if exists (
    select 1 from reservations
    where table_id = p_table_id and status = 'oturdu' and id <> p_reservation_id
  ) then
    raise exception 'Bu masada zaten oturan bir misafir var';
  end if;

  insert into reservation_tables (reservation_id, table_id)
  values (p_reservation_id, p_table_id)
  on conflict (reservation_id, table_id) do nothing;

  update reservations
  set status = 'oturdu', seated_at = now(), left_at = null, table_id = p_table_id
  where id = p_reservation_id;

  for v_masa_id in select table_id from reservation_tables where reservation_id = p_reservation_id loop
    update restaurant_tables
    set status = 'occupied', reservation_note = null, updated_at = now()
    where id = v_masa_id;
  end loop;

  update valet_entries
  set matched_table_id = p_table_id
  where id = (
    select id from valet_entries
    where restaurant_id = v_rest and status = 'bekliyor' and matched_table_id is null
      and lower(trim(guest_name)) = lower(trim(v_guest_name))
    order by parked_at desc
    limit 1
  );

  return p_reservation_id;
end;
$$;

create or replace function end_reservation_visit(p_reservation_id uuid)
returns void
language plpgsql
as $$
declare
  v_masa_id uuid;
begin
  update reservations
  set status = 'kalkti', left_at = now()
  where id = p_reservation_id and status = 'oturdu';
  if not found then
    raise exception 'Oturan bir rezervasyon bulunamadı';
  end if;

  for v_masa_id in select table_id from reservation_tables where reservation_id = p_reservation_id loop
    update restaurant_tables
    set status = 'empty', reservation_note = null, updated_at = now()
    where id = v_masa_id;
  end loop;
end;
$$;

create or replace function set_reservation_status(p_reservation_id uuid, p_status text, p_cancel_reason text default null)
returns void
language plpgsql
as $$
declare
  v_masa_id uuid;
begin
  update reservations
  set status = p_status,
      arrived_at = case when p_status = 'geldi' then now() else arrived_at end,
      left_at    = case when p_status = 'kalkti' then now() else left_at end,
      cancel_reason = case when p_status = 'iptal' then nullif(trim(coalesce(p_cancel_reason, '')), '') else cancel_reason end
  where id = p_reservation_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if p_status in ('iptal', 'gelmedi', 'kalkti') then
    for v_masa_id in select table_id from reservation_tables where reservation_id = p_reservation_id loop
      update restaurant_tables
      set status = 'empty', reservation_note = null, updated_at = now()
      where id = v_masa_id and status in ('reserved', 'occupied');
    end loop;
  end if;
end;
$$;
