-- Satış tahmini ve personel planlama.
--
-- 7shifts, Toast ve Nory'nin ana silahı bu: geçmiş satıştan yarını tahmin et, personeli
-- ona göre planla. Nory'nin iddiası israfta %50'ye, işçilikte %10–25'e varan azalma.
-- Bizde vardiya kaydı ve müşteri sayısı zaten vardı; eksik olan ileriye bakan taraftı.
--
-- Yöntem bilerek basit ve açıklanabilir: aynı hafta gününün son 8 haftalık ağırlıklı
-- ortalaması (son 4 hafta çift ağırlık). Kara kutu bir model değil — işletmeci rakamın
-- nereden geldiğini görebilmeli, yoksa güvenmez. Güven seviyesi örnek sayısı ve
-- dalgalanmadan (değişim katsayısı) türetilir.

-- Hedef işçilik oranı: cironun yüzde kaçı personele gitmeli. Restoranda tipik bant %25–35.
alter table restaurant_settings add column if not exists target_labor_percent numeric(5,2) not null default 30;

create or replace function sales_forecast(p_restaurant uuid, p_days_ahead int default 7)
returns table (
  forecast_date      date,
  weekday            int,
  predicted_covers   numeric,
  predicted_revenue  numeric,
  sample_count       int,
  confidence         text
)
language sql
stable
as $$
  with gunluk as (
    select (o.closed_at at time zone 'Europe/Istanbul')::date as gun,
           extract(isodow from (o.closed_at at time zone 'Europe/Istanbul'))::int as hg,
           sum(o.total_amount) as ciro,
           sum(coalesce(o.party_size, 0)) as kisi
    from orders o
    where o.restaurant_id = p_restaurant
      and o.status = 'closed'
      and o.closed_at >= (current_date - 56)
    group by 1, 2
  ),
  agirlikli as (
    select hg,
           sum(ciro * w) / nullif(sum(w), 0) as ciro,
           sum(kisi * w) / nullif(sum(w), 0) as kisi,
           count(*)::int as ornek,
           coalesce(stddev_pop(ciro), 0) as sapma,
           nullif(avg(ciro), 0) as ort
    from (
      -- Son 4 hafta çift ağırlıklı: yakın geçmiş bugünü daha iyi anlatır.
      select hg, ciro, kisi, case when gun >= current_date - 28 then 2 else 1 end as w
      from gunluk
    ) x
    group by hg
  ),
  gelecek as (
    select (current_date + s)::date as d
    from generate_series(1, greatest(1, least(60, p_days_ahead))) as s
  )
  select g.d,
         extract(isodow from g.d)::int,
         round(coalesce(a.kisi, 0), 1),
         round(coalesce(a.ciro, 0), 2),
         coalesce(a.ornek, 0),
         case
           when coalesce(a.ornek, 0) < 2 then 'dusuk'
           when a.ort is null then 'dusuk'
           when a.sapma / a.ort > 0.35 then 'orta'
           when coalesce(a.ornek, 0) >= 4 then 'yuksek'
           else 'orta'
         end
  from gelecek g
  left join agirlikli a on a.hg = extract(isodow from g.d)::int
  order by g.d;
$$;

-- Personel planı: tahmini misafir sayısını geçmişteki "bir personel-saat kaç misafire
-- yetiyor" oranına bölerek gereken personel-saati bulur, ortalama saat maliyetiyle çarpar
-- ve hedef işçilik oranıyla kıyaslar.
create or replace function staffing_plan(p_restaurant uuid, p_days_ahead int default 7)
returns table (
  forecast_date         date,
  weekday               int,
  predicted_covers      numeric,
  predicted_revenue     numeric,
  covers_per_staff_hour numeric,
  suggested_staff_hours numeric,
  suggested_staff_count numeric,
  estimated_labor_cost  numeric,
  labor_percent         numeric,
  target_labor_percent  numeric,
  confidence            text
)
language sql
stable
as $$
  with saatler as (
    -- Son 8 haftanın toplam personel-saati ve maliyeti (staff_shift_cost ile aynı kural).
    select sum(extract(epoch from (coalesce(sh.ended_at, now()) - sh.started_at))::numeric) / 3600.0 as saat,
           sum(
             (extract(epoch from (coalesce(sh.ended_at, now()) - sh.started_at))::numeric / 3600.0) *
             case when coalesce(sm.hourly_rate, 0) > 0
                  then sm.hourly_rate
                  else coalesce(sm.gross_salary, 0) / 30.0 / 8.0 end
           ) as maliyet
    from staff_shifts sh
    join staff_members sm on sm.id = sh.staff_id
    where sh.restaurant_id = p_restaurant
      and sh.started_at >= (current_date - 56)
  ),
  misafir as (
    select sum(coalesce(o.party_size, 0))::numeric as kisi
    from orders o
    where o.restaurant_id = p_restaurant
      and o.status = 'closed'
      and o.closed_at >= (current_date - 56)
  ),
  oran as (
    select case when coalesce((select saat from saatler), 0) > 0
                then (select kisi from misafir) / (select saat from saatler)
                else null end as kisi_basi_saat,
           case when coalesce((select saat from saatler), 0) > 0
                then (select maliyet from saatler) / (select saat from saatler)
                else null end as saat_maliyeti
  ),
  hedef as (
    select coalesce(target_labor_percent, 30) as yuzde
    from restaurant_settings where restaurant_id = p_restaurant
  )
  select f.forecast_date,
         f.weekday,
         f.predicted_covers,
         f.predicted_revenue,
         round(o.kisi_basi_saat, 2),
         round(case when o.kisi_basi_saat > 0 then f.predicted_covers / o.kisi_basi_saat else null end, 1),
         -- 8 saatlik vardiya varsayımı; yarım vardiyaları görebilmek için yuvarlanmıyor.
         round(case when o.kisi_basi_saat > 0 then f.predicted_covers / o.kisi_basi_saat / 8.0 else null end, 1),
         round(case when o.kisi_basi_saat > 0 then (f.predicted_covers / o.kisi_basi_saat) * o.saat_maliyeti else null end, 2),
         round(case when o.kisi_basi_saat > 0 and f.predicted_revenue > 0
                    then ((f.predicted_covers / o.kisi_basi_saat) * o.saat_maliyeti) / f.predicted_revenue * 100
                    else null end, 1),
         coalesce((select yuzde from hedef), 30),
         f.confidence
  from sales_forecast(p_restaurant, p_days_ahead) f
  cross join oran o
  order by f.forecast_date;
$$;
