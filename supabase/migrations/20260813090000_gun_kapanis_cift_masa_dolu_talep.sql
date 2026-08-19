-- ÜÇ KARAR (Gökhan, 2026-08-13)
--
-- 1) GÜN KAPANIŞI AYARI. Gün kendi kendine kapanmıyordu; akşam "Günü kapat"a basılmazsa dünkü
--    oturanlar sabaha oturuyor olarak giriyor, masaları dolu kalıyordu. Artık ayardan seçiliyor:
--    "otomatik" ise program sabah sessizce kapatır, "sor" ise sorar.
--
-- 2) AYNI MASA İKİ REZERVASYONA VERİLEMEZ. Ekran engelliyordu, veritabanı engellemiyordu; iki
--    personel iki cihazdan aynı anda aynı masayı verebilirdi (Gökhan: "engel koymak başka bir
--    şeye etki etmeyecekse engelle, karşımıza başka sorun çıkmasın"). Engel SADECE elle
--    atamada: yerleşim planı (apply_seating_plan) masayı bir rezervasyondan alıp diğerine
--    verebilir, o normal işleyiş, ona dokunulmadı.
--
-- 3) DOLU GÜN TALEPLERİ. Kapasite dolduktan sonra rezervasyon alınmaz ama "kaç kişi aradı"
--    bilgisi kayda değer (Gökhan). Dışarıdan gelen istek reddedilirken buraya yazılır.

alter table public.restaurant_settings
  add column if not exists gun_kapanis text not null default 'sor';

create table if not exists public.dolu_gun_talepleri (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  gun date not null,
  kisi integer not null,
  ad text,
  telefon text,
  kanal text not null default 'online',
  created_at timestamptz not null default now()
);
create index if not exists idx_dolu_gun_talepleri_restoran on public.dolu_gun_talepleri(restaurant_id, gun);

alter table public.dolu_gun_talepleri enable row level security;
drop policy if exists isletme_erisimi on public.dolu_gun_talepleri;
create policy isletme_erisimi on public.dolu_gun_talepleri for all to authenticated
  using (public.yonetici_mi() or restaurant_id in (select public.erisilen_restoranlar()))
  with check (public.yonetici_mi() or restaurant_id in (select public.erisilen_restoranlar()));

-- Elle masa atamada çift rezervasyon engeli.
create or replace function public.assign_reservation_tables(p_reservation_id uuid, p_table_ids uuid[])
returns void
language plpgsql
as $function$
declare
  v_rest uuid;
  v_name text;
  v_party int;
  v_saat text;
  v_note text;
  v_gun date;
  v_cakisan text;
begin
  if p_table_ids is null or array_length(p_table_ids, 1) is null or array_length(p_table_ids, 1) = 0 then
    raise exception 'En az bir masa seçilmeli';
  end if;

  select restaurant_id, guest_name, party_size,
         to_char(reserved_at at time zone 'Europe/Istanbul', 'HH24:MI'),
         (reserved_at at time zone 'Europe/Istanbul')::date
  into v_rest, v_name, v_party, v_saat, v_gun
  from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  -- Aynı gün, aynı masa, başka bir aktif rezervasyon varsa atama yapılmaz.
  select string_agg(distinct r.guest_name, ', ') into v_cakisan
  from reservation_tables rt
  join reservations r on r.id = rt.reservation_id
  where rt.table_id = any (p_table_ids)
    and r.id <> p_reservation_id
    and r.deleted_at is null
    and r.status in ('bekleniyor', 'geldi', 'oturdu')
    and (r.reserved_at at time zone 'Europe/Istanbul')::date = v_gun;
  if v_cakisan is not null then
    raise exception 'Bu masa aynı gün başka bir rezervasyona ayrılmış (%). Önce oradan boşaltın.', v_cakisan;
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
$function$;
