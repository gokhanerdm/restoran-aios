-- İSTATİSTİKLER > Bekleme & Walk-in (Gökhan, 2026-08-07). Bekleme listesi (Yedek) şu an ürün
-- olarak yok (simülasyon için kaldırıldı, ileride geri gelecek) — sadece Walk-in kısmı çalışır.
create or replace function istatistik_walkin(p_restaurant uuid, p_baslangic timestamptz, p_bitis timestamptz)
returns table (
  toplam_rezervasyon bigint, toplam_walkin bigint, toplam_walkin_kisi bigint,
  gun_dagilimi jsonb, saat_dagilimi jsonb, salon_dagilimi jsonb
)
language sql
stable
as $$
  with donem as (
    select r.*, (r.reserved_at at time zone 'Europe/Istanbul') as yerel
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at >= p_baslangic and r.reserved_at < p_bitis
  ),
  walkinler as (select * from donem where source = 'kapi')
  select
    (select count(*) from donem)::bigint,
    (select count(*) from walkinler)::bigint,
    (select coalesce(sum(party_size), 0) from walkinler)::bigint,
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', g.gun_no, 'adet', g.adet)), '[]'::jsonb)
       from (select ((extract(dow from yerel)::int + 6) % 7) as gun_no, count(*) as adet from walkinler group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('saat', g.saat, 'adet', g.adet)), '[]'::jsonb)
       from (select extract(hour from yerel)::int as saat, count(*) as adet from walkinler group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('salon', g.salon, 'adet', g.adet) order by g.adet desc), '[]'::jsonb)
       from (
         select coalesce(a.name, 'DİĞER') as salon, count(distinct w.id) as adet
         from walkinler w
         join reservation_tables rt on rt.reservation_id = w.id
         join restaurant_tables t on t.id = rt.table_id
         left join dining_areas a on a.id = t.area_id
         group by 1
       ) g);
$$;
