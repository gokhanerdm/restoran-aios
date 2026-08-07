-- İSTATİSTİKLER > Genel Bakış (Gökhan, 2026-08-07). Seçilen tarih aralığı + otomatik hesaplanan
-- "önceki dönem" (aynı uzunlukta, hemen öncesindeki aralık) karşılaştırması.
--
-- Tanımlar:
--   toplam_rezervasyon/toplam_misafir: dönemde REZERVE EDİLEN her şey (durum fark etmez) —
--     talebi gösterir.
--   gelen_rezervasyon/gelen_misafir: fiilen gelenler (geldi/oturdu/tamamlandi).
--   doluluk_orani: gelen misafir koltuk-günü / (toplam koltuk × gün sayısı) — POS yok, gerçek
--     masa devir hesabı değil, kaba bir kapasite kullanım oranı.
--   yeni_musteri: bu dönemde İLK KEZ gelen (daha önce hiç kaydı olmayan) kişi sayısı —
--     kisi_karti_id varsa ondan, yoksa telefon+isimden.
--   tekrar_orani: bu dönemde gelenlerin kaçının dönem başlamadan ÖNCE de kaydı vardı.
create or replace function istatistik_genel_ozet(
  p_restaurant uuid, p_baslangic timestamptz, p_bitis timestamptz,
  p_onceki_baslangic timestamptz, p_onceki_bitis timestamptz
)
returns table (
  toplam_rezervasyon bigint, toplam_misafir bigint,
  gelen_rezervasyon bigint, gelen_misafir bigint,
  iptal_sayisi bigint, gelmedi_sayisi bigint, walkin_sayisi bigint,
  ortalama_kisi numeric, doluluk_orani numeric,
  yeni_musteri_sayisi bigint, tekrar_orani numeric,
  onceki_toplam_rezervasyon bigint, onceki_toplam_misafir bigint
)
language plpgsql
stable
as $$
declare
  v_toplam_kapasite int;
  v_gun_sayisi numeric;
begin
  select coalesce(sum(seat_count), 0) into v_toplam_kapasite
  from restaurant_tables where restaurant_id = p_restaurant and deleted_at is null;

  v_gun_sayisi := greatest(extract(epoch from (p_bitis - p_baslangic)) / 86400, 1);

  return query
  with donem as (
    select * from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at >= p_baslangic and r.reserved_at < p_bitis
  ),
  gelenler as (
    select * from donem where status in ('geldi', 'oturdu', 'tamamlandi')
  ),
  -- Bu kişi (kart varsa kart, yoksa telefon, o da yoksa isim) dönem BAŞLAMADAN önce
  -- geldi/oturdu/tamamlandi bir kaydı var mıydı?
  kisi_anahtari as (
    select g.id,
      coalesce(g.kisi_karti_id::text, nullif(regexp_replace(coalesce(g.guest_phone, ''), '\D', '', 'g'), ''), lower(trim(g.guest_name))) as anahtar
    from gelenler g
  ),
  eski_musteriler as (
    select distinct coalesce(r.kisi_karti_id::text, nullif(regexp_replace(coalesce(r.guest_phone, ''), '\D', '', 'g'), ''), lower(trim(r.guest_name))) as anahtar
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at < p_baslangic and r.status in ('geldi', 'oturdu', 'tamamlandi')
  )
  select
    (select count(*) from donem)::bigint,
    (select coalesce(sum(party_size), 0) from donem)::bigint,
    (select count(*) from gelenler)::bigint,
    (select coalesce(sum(party_size), 0) from gelenler)::bigint,
    (select count(*) from donem where status = 'iptal')::bigint,
    (select count(*) from donem where status = 'gelmedi')::bigint,
    (select count(*) from donem where source = 'kapi')::bigint,
    (select round(avg(party_size), 1) from donem),
    case when v_toplam_kapasite > 0
      then round((select coalesce(sum(party_size), 0) from gelenler)::numeric / (v_toplam_kapasite * v_gun_sayisi) * 100, 1)
      else null end,
    (select count(distinct ka.anahtar) from kisi_anahtari ka
       where not exists (select 1 from eski_musteriler em where em.anahtar = ka.anahtar))::bigint,
    case when (select count(distinct anahtar) from kisi_anahtari) > 0
      then round((select count(distinct ka.anahtar) from kisi_anahtari ka
             where exists (select 1 from eski_musteriler em where em.anahtar = ka.anahtar))::numeric
           / (select count(distinct anahtar) from kisi_anahtari) * 100, 1)
      else null end,
    (select count(*) from reservations r where r.restaurant_id = p_restaurant and r.deleted_at is null
       and r.reserved_at >= p_onceki_baslangic and r.reserved_at < p_onceki_bitis)::bigint,
    (select coalesce(sum(party_size), 0) from reservations r where r.restaurant_id = p_restaurant and r.deleted_at is null
       and r.reserved_at >= p_onceki_baslangic and r.reserved_at < p_onceki_bitis)::bigint;
end;
$$;
