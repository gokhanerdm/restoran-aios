-- Masa ataması — günlük iş (Gökhan, 2026-07-31): "rezervasyonlara masalar tarihi gelince
-- atanır, ileri bir tarihin rezervasyonu şu masada olsun diye atanmaz... işletme masa planını
-- aynı gün yapar." Yani "Masa ata" SADECE bugünün rezervasyonları için anlamlı — Karşılama
-- ekranı bunu zaten sadece bugünü görüntülerken gösterecek. Bu netleşince eski
-- 20260727100200_reservations.sql'deki "masa durumunu yönetmez" kararı de facto geçersiz
-- oluyor: aynı gün ataması, masayı aynı gün bloke etmeli ki başka biri oraya oturtulmasın.
--
-- Atama artık restaurant_tables.status'u 'reserved' yapar + görünür bir not bırakır (eski
-- "Rzv" hızlı-bayrak özelliğinin kullandığı AYNI status/reservation_note alanları — Adisyon
-- ekranının TableBox'ı zaten bunu render ediyor, sıfır kod değişikliği gerekmiyor).

-- open_table_order sadece 'empty'den oturtmaya izin veriyordu; artık 'reserved' masadan da
-- (rezervasyon oturunca) oturtulabilmeli.
create or replace function open_table_order(p_restaurant_id uuid, p_table_id uuid, p_party_size integer, p_staff_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
  v_status text;
begin
  select status into v_status from restaurant_tables where id = p_table_id and restaurant_id = p_restaurant_id and deleted_at is null;
  if v_status is null then
    raise exception 'Masa bulunamadı';
  end if;
  if v_status not in ('empty', 'reserved') then
    raise exception 'Masa müsait değil (durum: %)', v_status;
  end if;
  if exists (select 1 from orders where table_id = p_table_id and status = 'open') then
    raise exception 'Bu masada zaten açık bir sipariş var';
  end if;

  insert into orders (restaurant_id, table_id, status, channel, party_size)
  values (p_restaurant_id, p_table_id, 'open', 'dine_in', greatest(1, p_party_size))
  returning id into v_order_id;

  update restaurant_tables set status = 'occupied', reservation_note = null, updated_at = now() where id = p_table_id;

  return v_order_id;
end;
$$;

-- Masa ata: tek RPC'de hem reservations.table_id hem restaurant_tables.status/reservation_note
-- güncellenir (PAGE_STANDARDS: birden çok tabloyu etkileyen işlem RPC'de atomik olsun).
-- Farklı bir masaya YENİDEN atanırsa eski masa serbest bırakılır.
create or replace function assign_reservation_table(p_reservation_id uuid, p_table_id uuid)
returns void
language plpgsql
as $$
declare
  v_rest uuid;
  v_name text;
  v_party int;
  v_saat text;
  v_old_table uuid;
begin
  select restaurant_id, guest_name, party_size, to_char(reserved_at at time zone 'Europe/Istanbul', 'HH24:MI'), table_id
  into v_rest, v_name, v_party, v_saat, v_old_table
  from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if v_old_table is not null and v_old_table <> p_table_id then
    update restaurant_tables set status = 'empty', reservation_note = null
    where id = v_old_table and status = 'reserved';
  end if;

  update reservations set table_id = p_table_id where id = p_reservation_id;

  update restaurant_tables
  set status = 'reserved', reservation_note = v_saat || ' · ' || v_name || ' · ' || v_party || ' kişi'
  where id = p_table_id and restaurant_id = v_rest and status = 'empty';
end;
$$;

-- Durum değişikliği (Geldi/Gelmedi/İptal) — Gelmedi/İptal olursa, atanmış masa varsa ve hâlâ
-- "reserved" ise (henüz oturtulmadıysa) masa serbest kalır, başkası kullanabilsin.
create or replace function set_reservation_status(p_reservation_id uuid, p_status text)
returns void
language plpgsql
as $$
declare
  v_table uuid;
begin
  update reservations
  set status = p_status, arrived_at = case when p_status = 'geldi' then now() else arrived_at end
  where id = p_reservation_id
  returning table_id into v_table;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if p_status in ('iptal', 'gelmedi') and v_table is not null then
    update restaurant_tables set status = 'empty', reservation_note = null
    where id = v_table and status = 'reserved';
  end if;
end;
$$;
