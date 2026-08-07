-- İSTATİSTİKLER > Rezervasyonlar sekmesi üst özet — artık tek satır değil, aynı gün/hafta/ay
-- başlıkları altında birden fazla satır: Rezervasyonlar (toplam), Geldi, Gelmedi, İptal,
-- Bekleyen. Önceki tek-satırlık fonksiyonun yerini alıyor. Gökhan, 2026-08-07.
drop function if exists istatistik_rezervasyon_ozet_satir(uuid, timestamptz);

create or replace function istatistik_rezervasyon_ozet_satirlari(p_restaurant uuid, p_referans timestamptz)
returns table (kategori text, gunluk bigint, haftalik bigint, aylik bigint)
language sql
stable
as $$
  with sinir as (
    select
      (p_referans at time zone 'Europe/Istanbul')::date as gun,
      date_trunc('week', (p_referans at time zone 'Europe/Istanbul'))::date as hafta_bas,
      date_trunc('month', (p_referans at time zone 'Europe/Istanbul'))::date as ay_bas
  )
  select 'toplam',
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
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.ay_bas + interval '1 month')
  union all
  select 'geldi',
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status in ('geldi', 'oturdu', 'tamamlandi')
         and (r.reserved_at at time zone 'Europe/Istanbul')::date = s.gun),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status in ('geldi', 'oturdu', 'tamamlandi')
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.hafta_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.hafta_bas + 7),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status in ('geldi', 'oturdu', 'tamamlandi')
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.ay_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.ay_bas + interval '1 month')
  union all
  select 'gelmedi',
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status = 'gelmedi'
         and (r.reserved_at at time zone 'Europe/Istanbul')::date = s.gun),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status = 'gelmedi'
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.hafta_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.hafta_bas + 7),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status = 'gelmedi'
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.ay_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.ay_bas + interval '1 month')
  union all
  select 'iptal',
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status = 'iptal'
         and (r.reserved_at at time zone 'Europe/Istanbul')::date = s.gun),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status = 'iptal'
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.hafta_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.hafta_bas + 7),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status = 'iptal'
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.ay_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.ay_bas + interval '1 month')
  union all
  select 'bekleyen',
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status = 'bekleniyor'
         and (r.reserved_at at time zone 'Europe/Istanbul')::date = s.gun),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status = 'bekleniyor'
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.hafta_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.hafta_bas + 7),
    (select count(*) from reservations r, sinir s
       where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status = 'bekleniyor'
         and (r.reserved_at at time zone 'Europe/Istanbul')::date >= s.ay_bas
         and (r.reserved_at at time zone 'Europe/Istanbul')::date < s.ay_bas + interval '1 month');
$$;
