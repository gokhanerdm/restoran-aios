-- İSTATİSTİKLER > Doluluk & Masalar (Gökhan, 2026-08-07): masa performansı, salon/bölüm
-- performansı, gün×saat yoğunluk, kalış süresi (kişi sayısına göre), kapasite kaybı.
create or replace function istatistik_masa(p_restaurant uuid, p_baslangic timestamptz, p_bitis timestamptz)
returns table (
  masa_performans jsonb, salon_performans jsonb, isi_haritasi jsonb,
  kalis_2 numeric, kalis_3_4 numeric, kalis_5_plus numeric,
  kaybedilen_iptal_kisi bigint, kaybedilen_gelmedi_kisi bigint
)
language sql
stable
as $$
  with gelenler as (
    select r.id, r.party_size, r.arrived_at, r.left_at,
      (r.reserved_at at time zone 'Europe/Istanbul') as yerel,
      extract(epoch from (r.left_at - r.arrived_at)) / 60 as kalis_dk
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at >= p_baslangic and r.reserved_at < p_bitis
      and r.status in ('oturdu', 'tamamlandi')
  ),
  masa_kullanim as (
    select rt.table_id, count(distinct rt.reservation_id) as kullanim_sayisi,
      sum(g.party_size) as toplam_oturan, avg(g.party_size) as ortalama_kisi, avg(g.kalis_dk) as ortalama_dakika
    from reservation_tables rt
    join gelenler g on g.id = rt.reservation_id
    group by rt.table_id
  ),
  masa_liste as (
    select t.id, t.name, t.seat_count, t.area_id,
      coalesce(mk.kullanim_sayisi, 0) as kullanim_sayisi, coalesce(mk.toplam_oturan, 0) as toplam_oturan,
      mk.ortalama_kisi, mk.ortalama_dakika
    from restaurant_tables t
    left join masa_kullanim mk on mk.table_id = t.id
    where t.restaurant_id = p_restaurant and t.deleted_at is null
  ),
  salon_kullanim as (
    select coalesce(a.name, 'DİĞER') as salon_adi, sum(ml.kullanim_sayisi) as kullanim_sayisi,
      sum(ml.toplam_oturan) as misafir, avg(ml.ortalama_dakika) as ortalama_dakika
    from masa_liste ml
    left join dining_areas a on a.id = ml.area_id
    group by 1
  ),
  isi as (
    select ((extract(dow from yerel)::int + 6) % 7) as gun_no, extract(hour from yerel)::int as saat, count(*) as adet
    from gelenler
    group by 1, 2
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', ml.id, 'ad', ml.name, 'kapasite', ml.seat_count, 'kullanim', ml.kullanim_sayisi,
        'toplam_oturan', ml.toplam_oturan,
        'ortalama_kisi', round(ml.ortalama_kisi::numeric, 1),
        'ortalama_dakika', round(ml.ortalama_dakika::numeric)
      ) order by ml.kullanim_sayisi desc, ml.name), '[]'::jsonb)
     from masa_liste ml),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'salon', sk.salon_adi, 'kullanim', sk.kullanim_sayisi, 'misafir', sk.misafir,
        'ortalama_dakika', round(sk.ortalama_dakika::numeric)
      ) order by sk.kullanim_sayisi desc), '[]'::jsonb)
     from salon_kullanim sk),
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', i.gun_no, 'saat', i.saat, 'adet', i.adet)), '[]'::jsonb) from isi i),
    (select round(avg(kalis_dk)::numeric, 0) from gelenler where party_size <= 2 and kalis_dk is not null),
    (select round(avg(kalis_dk)::numeric, 0) from gelenler where party_size between 3 and 4 and kalis_dk is not null),
    (select round(avg(kalis_dk)::numeric, 0) from gelenler where party_size >= 5 and kalis_dk is not null),
    (select coalesce(sum(party_size), 0) from reservations where restaurant_id = p_restaurant and deleted_at is null
       and reserved_at >= p_baslangic and reserved_at < p_bitis and status = 'iptal')::bigint,
    (select coalesce(sum(party_size), 0) from reservations where restaurant_id = p_restaurant and deleted_at is null
       and reserved_at >= p_baslangic and reserved_at < p_bitis and status = 'gelmedi')::bigint;
$$;
