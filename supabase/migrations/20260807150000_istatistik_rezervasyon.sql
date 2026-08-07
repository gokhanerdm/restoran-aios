-- İSTATİSTİKLER > Rezervasyonlar (Gökhan, 2026-08-07): günlük/saatlik/haftanın günü dağılımı,
-- ne kadar önceden yapıldığı, grup büyüklüğü dağılımı.
create or replace function istatistik_rezervasyon(p_restaurant uuid, p_baslangic timestamptz, p_bitis timestamptz)
returns table (
  gunluk_dagilim jsonb, saatlik_dagilim jsonb, haftanin_gunu_dagilim jsonb,
  ortalama_onceden_gun numeric, ayni_gun_orani numeric,
  grup_1_2 bigint, grup_3_4 bigint, grup_5_6 bigint, grup_7_plus bigint
)
language sql
stable
as $$
  with donem as (
    select r.*, (r.reserved_at at time zone 'Europe/Istanbul') as yerel_rez, (r.created_at at time zone 'Europe/Istanbul') as yerel_olusturma
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at >= p_baslangic and r.reserved_at < p_bitis
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('gun', g.gun, 'rezervasyon', g.adet, 'misafir', g.misafir) order by g.gun), '[]'::jsonb)
       from (select yerel_rez::date as gun, count(*) as adet, sum(party_size) as misafir from donem group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('saat', g.saat, 'rezervasyon', g.adet) order by g.saat), '[]'::jsonb)
       from (select extract(hour from yerel_rez)::int as saat, count(*) as adet from donem group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', g.gun_no, 'rezervasyon', g.adet) order by g.gun_no), '[]'::jsonb)
       from (select ((extract(dow from yerel_rez)::int + 6) % 7) as gun_no, count(*) as adet from donem group by 1) g),
    (select round(avg(extract(epoch from (reserved_at - created_at)) / 86400), 1) from donem),
    case when count(*) > 0
      then round((count(*) filter (where yerel_olusturma::date = yerel_rez::date))::numeric / count(*) * 100, 1)
      else null end,
    count(*) filter (where party_size <= 2),
    count(*) filter (where party_size between 3 and 4),
    count(*) filter (where party_size between 5 and 6),
    count(*) filter (where party_size >= 7)
  from donem;
$$;
