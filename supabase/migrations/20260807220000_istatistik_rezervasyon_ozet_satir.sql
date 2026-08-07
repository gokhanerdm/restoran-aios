-- İSTATİSTİKLER > Rezervasyonlar sekmesi üstündeki özet satır: seçili tarih filtresinin
-- başlangıcını referans alıp o günün, o haftanın (Pzt-Paz), o ayın rezervasyon sayısını
-- tek satırda gösterir. Gökhan, 2026-08-07.
create or replace function istatistik_rezervasyon_ozet_satir(p_restaurant uuid, p_referans timestamptz)
returns table (gunluk bigint, haftalik bigint, aylik bigint)
language sql
stable
as $$
  with sinir as (
    select
      (p_referans at time zone 'Europe/Istanbul')::date as gun,
      date_trunc('week', (p_referans at time zone 'Europe/Istanbul'))::date as hafta_bas,
      date_trunc('month', (p_referans at time zone 'Europe/Istanbul'))::date as ay_bas
  )
  select
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null
         and (r.reserved_at at time zone 'Europe/Istanbul')::date = s.gun),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.hafta_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.hafta_bas + 7),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.ay_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.ay_bas + interval '1 month');
$$;
