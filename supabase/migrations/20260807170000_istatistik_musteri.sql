-- İSTATİSTİKLER > Müşteriler (Gökhan, 2026-08-07): müşteri istatistikleri + geri dönüş
-- (retention) dağılımı. "Anahtar" = kisi_karti_id varsa o, yoksa telefon, o da yoksa isim —
-- kişi kartı sistemiyle aynı eşleştirme mantığı.
create or replace function istatistik_musteri(p_restaurant uuid, p_baslangic timestamptz, p_bitis timestamptz)
returns table (
  toplam_kayitli_musteri bigint, vip_sayisi bigint,
  donem_musteri_sayisi bigint, yeni_musteri_sayisi bigint,
  uzun_suredir_gelmeyen_sayisi bigint,
  ortalama_ziyaret_sikligi_gun numeric, ortalama_ziyaret_sayisi numeric, musteri_basina_rezervasyon numeric,
  ilk_kez bigint, ikinci_kez bigint, uc_bes bigint, alti_on bigint, on_plus bigint,
  en_sik_gelenler jsonb, en_cok_kisi_getirenler jsonb
)
language sql
stable
as $$
  with tum_ziyaretler as (
    select r.id, r.guest_name, r.guest_phone, r.party_size, r.reserved_at,
      coalesce(r.kisi_karti_id::text, nullif(regexp_replace(coalesce(r.guest_phone, ''), '\D', '', 'g'), ''), lower(trim(r.guest_name))) as anahtar
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status in ('oturdu', 'tamamlandi')
  ),
  musteri_ozet as (
    select anahtar, (array_agg(guest_name order by reserved_at desc))[1] as isim,
      (array_agg(guest_phone order by reserved_at desc))[1] as telefon,
      count(*) as toplam_ziyaret, min(reserved_at) as ilk_ziyaret, max(reserved_at) as son_ziyaret,
      sum(party_size) as toplam_getirdigi_kisi
    from tum_ziyaretler
    group by anahtar
  ),
  donem_musteriler as (
    select distinct anahtar from tum_ziyaretler where reserved_at >= p_baslangic and reserved_at < p_bitis
  ),
  donem_frekans as (
    select mo.anahtar, mo.toplam_ziyaret,
      case when mo.toplam_ziyaret > 1 then extract(epoch from (mo.son_ziyaret - mo.ilk_ziyaret)) / 86400 / (mo.toplam_ziyaret - 1) end as sikliği_gun
    from musteri_ozet mo join donem_musteriler dm on dm.anahtar = mo.anahtar
  )
  select
    (select count(*) from kisi_kartlari where restaurant_id = p_restaurant)::bigint,
    (select count(*) from kisi_kartlari where restaurant_id = p_restaurant and vip)::bigint,
    (select count(*) from donem_musteriler)::bigint,
    (select count(*) from musteri_ozet mo join donem_musteriler dm on dm.anahtar = mo.anahtar where mo.ilk_ziyaret >= p_baslangic)::bigint,
    (select count(*) from musteri_ozet where son_ziyaret < p_bitis - interval '90 days')::bigint,
    (select round(avg(sikliği_gun)::numeric, 1) from donem_frekans where sikliği_gun is not null),
    (select round(avg(toplam_ziyaret)::numeric, 1) from donem_frekans),
    case when (select count(*) from donem_musteriler) > 0
      then round((select count(*) from tum_ziyaretler where reserved_at >= p_baslangic and reserved_at < p_bitis)::numeric / (select count(*) from donem_musteriler), 1)
      else null end,
    (select count(*) from donem_frekans where toplam_ziyaret = 1)::bigint,
    (select count(*) from donem_frekans where toplam_ziyaret = 2)::bigint,
    (select count(*) from donem_frekans where toplam_ziyaret between 3 and 5)::bigint,
    (select count(*) from donem_frekans where toplam_ziyaret between 6 and 10)::bigint,
    (select count(*) from donem_frekans where toplam_ziyaret > 10)::bigint,
    (select coalesce(jsonb_agg(jsonb_build_object('isim', x.isim, 'telefon', x.telefon, 'ziyaret', x.toplam_ziyaret)), '[]'::jsonb)
       from (select isim, telefon, toplam_ziyaret from musteri_ozet order by toplam_ziyaret desc limit 10) x),
    (select coalesce(jsonb_agg(jsonb_build_object('isim', x.isim, 'telefon', x.telefon, 'kisi', x.toplam_getirdigi_kisi)), '[]'::jsonb)
       from (select isim, telefon, toplam_getirdigi_kisi from musteri_ozet order by toplam_getirdigi_kisi desc limit 10) x);
$$;
