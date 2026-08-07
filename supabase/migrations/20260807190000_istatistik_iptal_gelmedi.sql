-- İSTATİSTİKLER > İptal & Gelmedi (Gökhan, 2026-08-07). "No-show" değil "Gelmedi" — Türkçe.
-- "Kim iptal etti" (müşteri/işletme) ayrımı şu an tutulmuyor, bu yüzden o kırılım yok.
create or replace function istatistik_iptal_gelmedi(p_restaurant uuid, p_baslangic timestamptz, p_bitis timestamptz)
returns table (
  toplam_rezervasyon bigint,
  toplam_iptal bigint, iptal_orani numeric, iptal_kapasite bigint,
  ortalama_iptal_saat_once numeric, ayni_gun_iptal_orani numeric,
  iptal_gun_dagilimi jsonb, iptal_saat_dagilimi jsonb,
  toplam_gelmedi bigint, gelmedi_orani numeric, gelmedi_kapasite bigint,
  tekrarlayan_gelmedi_musteri bigint,
  gelmedi_gun_dagilimi jsonb, gelmedi_saat_dagilimi jsonb, gelmedi_grup_dagilimi jsonb
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
  iptaller as (select * from donem where status = 'iptal'),
  gelmediler as (select * from donem where status = 'gelmedi'),
  gelmedi_anahtar as (
    select coalesce(kisi_karti_id::text, nullif(regexp_replace(coalesce(guest_phone, ''), '\D', '', 'g'), ''), lower(trim(guest_name))) as anahtar
    from gelmediler
  )
  select
    (select count(*) from donem)::bigint,
    (select count(*) from iptaller)::bigint,
    case when (select count(*) from donem) > 0 then round((select count(*) from iptaller)::numeric / (select count(*) from donem) * 100, 1) else null end,
    (select coalesce(sum(party_size), 0) from iptaller)::bigint,
    (select round(avg(extract(epoch from (reserved_at - cancelled_at)) / 3600)::numeric, 1) from iptaller where cancelled_at is not null),
    case when (select count(*) from iptaller where cancelled_at is not null) > 0
      then round((select count(*) from iptaller where cancelled_at is not null and (cancelled_at at time zone 'Europe/Istanbul')::date = (reserved_at at time zone 'Europe/Istanbul')::date)::numeric
           / (select count(*) from iptaller where cancelled_at is not null) * 100, 1)
      else null end,
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', g.gun_no, 'adet', g.adet)), '[]'::jsonb)
       from (select ((extract(dow from yerel)::int + 6) % 7) as gun_no, count(*) as adet from iptaller group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('saat', g.saat, 'adet', g.adet)), '[]'::jsonb)
       from (select extract(hour from yerel)::int as saat, count(*) as adet from iptaller group by 1) g),
    (select count(*) from gelmediler)::bigint,
    case when (select count(*) from donem) > 0 then round((select count(*) from gelmediler)::numeric / (select count(*) from donem) * 100, 1) else null end,
    (select coalesce(sum(party_size), 0) from gelmediler)::bigint,
    (select count(*) from (
       select ga.anahtar from gelmedi_anahtar ga group by ga.anahtar having count(*) > 1
     ) x)::bigint,
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', g.gun_no, 'adet', g.adet)), '[]'::jsonb)
       from (select ((extract(dow from yerel)::int + 6) % 7) as gun_no, count(*) as adet from gelmediler group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('saat', g.saat, 'adet', g.adet)), '[]'::jsonb)
       from (select extract(hour from yerel)::int as saat, count(*) as adet from gelmediler group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('grup', g.grup, 'adet', g.adet)), '[]'::jsonb)
       from (select case when party_size <= 2 then '1-2' when party_size <= 4 then '3-4' when party_size <= 6 then '5-6' else '7+' end as grup, count(*) as adet
             from gelmediler group by 1) g);
$$;
