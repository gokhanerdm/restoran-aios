-- Rezervasyon modülü AIOS'tan ayrıldı (Gökhan onayı, 2026-08-04).
--
-- Karar: rezervasyon artık kendi başına satılabilecek ayrı bir program. "Hesapla bir işi
-- yok" — misafir oturunca adisyon/sipariş AÇILMAZ, sadece masa dolu işaretlenir. Akış
-- kısaldı ve kendi içinde kapanıyor: bekleniyor -> geldi -> oturdu -> kalkti.
--
-- Bugüne kadar seat_reservation, open_table_order'ı çağırıp orders tablosuna satır atıyordu
-- (AIOS'un adisyon tarafı). Ayrı programda orders diye bir kavram olmayacağı için o bağ
-- kesildi. seated_order_id kolonu şimdilik duruyor (eski kayıtların geçmişi bozulmasın),
-- ama yeni oturtmalarda hep null kalıyor.

-- Misafir kalkınca masa boşalsın diye yeni durum + zaman damgası.
alter table reservations add column if not exists left_at timestamptz;

alter table reservations drop constraint if exists reservations_status_check;
alter table reservations add constraint reservations_status_check
  check (status in ('bekleniyor', 'geldi', 'oturdu', 'kalkti', 'gelmedi', 'iptal'));

-- Oturtma: sipariş açmaz. Masayı dolu yapar, vale girişte kaydettiyse masasını bağlar.
-- Aynı masaya ikinci bir misafiri oturtmayı engelliyor — eskiden bu kontrolü
-- open_table_order yapıyordu ("bu masada zaten açık bir sipariş var"), o gidince
-- kontrolsüz kalmasın diye buraya taşındı.
create or replace function seat_reservation(p_reservation_id uuid, p_table_id uuid, p_staff_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_rest uuid;
  v_guest_name text;
  v_table_status text;
begin
  select restaurant_id, guest_name into v_rest, v_guest_name
  from reservations where id = p_reservation_id and status in ('bekleniyor', 'geldi');
  if not found then
    raise exception 'Rezervasyon bulunamadı ya da zaten oturmuş/iptal edilmiş';
  end if;

  select status into v_table_status
  from restaurant_tables
  where id = p_table_id and restaurant_id = v_rest and deleted_at is null;
  if v_table_status is null then
    raise exception 'Masa bulunamadı';
  end if;

  if exists (
    select 1 from reservations
    where table_id = p_table_id and status = 'oturdu' and id <> p_reservation_id
  ) then
    raise exception 'Bu masada zaten oturan bir misafir var';
  end if;

  update reservations
  set status = 'oturdu', seated_at = now(), left_at = null, table_id = p_table_id
  where id = p_reservation_id;

  update restaurant_tables
  set status = 'occupied', reservation_note = null, updated_at = now()
  where id = p_table_id;

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

-- Misafir kalktı: masa boşalır. Rezervasyon programının akışını kapatan son adım —
-- eskiden bunu adisyonun kapanması (hesap ödenmesi) yapıyordu, artık burada.
create or replace function end_reservation_visit(p_reservation_id uuid)
returns void
language plpgsql
as $$
declare
  v_table uuid;
begin
  update reservations
  set status = 'kalkti', left_at = now()
  where id = p_reservation_id and status = 'oturdu'
  returning table_id into v_table;
  if not found then
    raise exception 'Oturan bir rezervasyon bulunamadı';
  end if;

  if v_table is not null then
    update restaurant_tables
    set status = 'empty', reservation_note = null, updated_at = now()
    where id = v_table;
  end if;
end;
$$;

-- set_reservation_status artık 'kalkti'yi de kabul ediyor (masa yine boşalır).
create or replace function set_reservation_status(p_reservation_id uuid, p_status text, p_cancel_reason text default null)
returns void
language plpgsql
as $$
declare
  v_table uuid;
begin
  update reservations
  set status = p_status,
      arrived_at = case when p_status = 'geldi' then now() else arrived_at end,
      left_at    = case when p_status = 'kalkti' then now() else left_at end,
      cancel_reason = case when p_status = 'iptal' then nullif(trim(coalesce(p_cancel_reason, '')), '') else cancel_reason end
  where id = p_reservation_id
  returning table_id into v_table;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if p_status in ('iptal', 'gelmedi', 'kalkti') and v_table is not null then
    update restaurant_tables
    set status = 'empty', reservation_note = null, updated_at = now()
    where id = v_table and status in ('reserved', 'occupied');
  end if;
end;
$$;
