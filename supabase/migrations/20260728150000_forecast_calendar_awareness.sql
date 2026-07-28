-- Satış tahminine takvim farkındalığı — ROADMAP §L(D) ve BUSINESS_LOGIC #4.
--
-- Şartname: "o gün bayram mı geliyor, geçen bayram ne olmuştu, yas mı, alkollü restoran ise
-- Ramazan mı". Mevcut sales_forecast bunların hiçbirini bilmiyordu; 30 Ağustos'u sıradan bir
-- Cumartesi sanıyordu. public_holidays tablosu 2026-07-01'den beri duruyor ama İÇİ BOŞTU,
-- yani daily_prep_report'un tatil kontrolü de bugüne kadar hep false dönüyordu.
--
-- İki düzeltme: (1) tatil günü, aynı hafta gününün ortalamasıyla değil GEÇMİŞTEKİ AYNI TÜR
-- tatillerle kıyaslanır; (2) normal hafta günü ortalaması hesaplanırken geçmiş tatiller
-- dışarıda bırakılır — yoksa bir bayram günü tüm Salı ortalamasını bozar.

alter table public_holidays add column if not exists kind text not null default 'resmi'
  check (kind in ('resmi', 'dini', 'yas', 'ramazan'));

-- Sabit tarihli ulusal bayramlar (2025–2027).
insert into public_holidays (holiday_date, name, kind)
select g.d::date, v.ad, 'resmi'
from (values
  ('01-01', 'Yılbaşı'),
  ('04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'),
  ('05-01', 'Emek ve Dayanışma Günü'),
  ('05-19', 'Atatürk''ü Anma, Gençlik ve Spor Bayramı'),
  ('07-15', 'Demokrasi ve Millî Birlik Günü'),
  ('08-30', 'Zafer Bayramı'),
  ('10-29', 'Cumhuriyet Bayramı')
) as v(mmdd, ad)
cross join (values ('2025'), ('2026'), ('2027')) as y(yil)
cross join lateral (select (y.yil || '-' || v.mmdd)) as g(d)
on conflict (holiday_date) do nothing;

-- Dini bayramlar — Türkiye'de asıl ciro kıran günler bunlar, atlanamaz.
-- Hicri takvim her yıl ~11 gün kaydığı için tarihler tek tek yazıldı (2025–2027).
-- DİKKAT: bu tarihler hesaplanmış değerlerdir, Diyanet takvimiyle bir gün oynayabilir —
-- işletmeci sapma görürse düzeltmeli. Tahmin tabanı için bir günlük kayma, tatili hiç
-- bilmemekten çok daha iyidir.
insert into public_holidays (holiday_date, name, kind) values
  ('2025-03-30', 'Ramazan Bayramı 1. gün', 'dini'),
  ('2025-03-31', 'Ramazan Bayramı 2. gün', 'dini'),
  ('2025-04-01', 'Ramazan Bayramı 3. gün', 'dini'),
  ('2025-06-06', 'Kurban Bayramı 1. gün', 'dini'),
  ('2025-06-07', 'Kurban Bayramı 2. gün', 'dini'),
  ('2025-06-08', 'Kurban Bayramı 3. gün', 'dini'),
  ('2025-06-09', 'Kurban Bayramı 4. gün', 'dini'),
  ('2026-03-20', 'Ramazan Bayramı 1. gün', 'dini'),
  ('2026-03-21', 'Ramazan Bayramı 2. gün', 'dini'),
  ('2026-03-22', 'Ramazan Bayramı 3. gün', 'dini'),
  ('2026-05-27', 'Kurban Bayramı 1. gün', 'dini'),
  ('2026-05-28', 'Kurban Bayramı 2. gün', 'dini'),
  ('2026-05-29', 'Kurban Bayramı 3. gün', 'dini'),
  ('2026-05-30', 'Kurban Bayramı 4. gün', 'dini'),
  ('2027-03-09', 'Ramazan Bayramı 1. gün', 'dini'),
  ('2027-03-10', 'Ramazan Bayramı 2. gün', 'dini'),
  ('2027-03-11', 'Ramazan Bayramı 3. gün', 'dini'),
  ('2027-05-16', 'Kurban Bayramı 1. gün', 'dini'),
  ('2027-05-17', 'Kurban Bayramı 2. gün', 'dini'),
  ('2027-05-18', 'Kurban Bayramı 3. gün', 'dini'),
  ('2027-05-19', 'Kurban Bayramı 4. gün', 'dini')
on conflict (holiday_date) do nothing;

-- Dönüş tipi değiştiği için create or replace yetmiyor, önce düşürülüyor.
drop function if exists staffing_plan(uuid, integer);
drop function if exists sales_forecast(uuid, integer);

create function sales_forecast(p_restaurant uuid, p_days_ahead int default 7)
returns table (
  forecast_date      date,
  weekday            int,
  predicted_covers   numeric,
  predicted_revenue  numeric,
  sample_count       int,
  confidence         text,
  holiday_name       text,
  holiday_kind       text,
  basis              text
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
      -- Tatil kıyası için 8 hafta yetmez; geçen yılın aynı bayramına bakabilmek adına 2 yıl.
      and o.closed_at >= (current_date - 730)
    group by 1, 2
  ),
  gunluk_tatil as (
    select g.*, h.kind as tatil_turu
    from gunluk g
    left join public_holidays h on h.holiday_date = g.gun
  ),
  -- 1) Normal hafta günü tabanı: son 8 hafta, TATİLLER HARİÇ.
  hafta_gunu as (
    select hg,
           sum(ciro * w) / nullif(sum(w), 0) as ciro,
           sum(kisi * w) / nullif(sum(w), 0) as kisi,
           count(*)::int as ornek,
           coalesce(stddev_pop(ciro), 0) as sapma,
           nullif(avg(ciro), 0) as ort
    from (
      select hg, ciro, kisi, case when gun >= current_date - 28 then 2 else 1 end as w
      from gunluk_tatil
      where tatil_turu is null and gun >= current_date - 56
    ) x
    group by hg
  ),
  -- 2) Tatil tabanı: geçmişteki AYNI TÜR tatil günlerinin ortalaması.
  tatil_turu_ort as (
    select tatil_turu,
           avg(ciro) as ciro,
           avg(kisi) as kisi,
           count(*)::int as ornek,
           coalesce(stddev_pop(ciro), 0) as sapma,
           nullif(avg(ciro), 0) as ort
    from gunluk_tatil
    where tatil_turu is not null
    group by tatil_turu
  ),
  gelecek as (
    select (current_date + s)::date as d
    from generate_series(1, greatest(1, least(60, p_days_ahead))) as s
  ),
  birlesik as (
    select g.d,
           extract(isodow from g.d)::int as hg,
           h.name as tatil_adi,
           h.kind as tatil_turu,
           t.ciro as t_ciro, t.kisi as t_kisi, t.ornek as t_ornek, t.sapma as t_sapma, t.ort as t_ort,
           w.ciro as w_ciro, w.kisi as w_kisi, w.ornek as w_ornek, w.sapma as w_sapma, w.ort as w_ort
    from gelecek g
    left join public_holidays h on h.holiday_date = g.d
    left join tatil_turu_ort t on t.tatil_turu = h.kind
    left join hafta_gunu w on w.hg = extract(isodow from g.d)::int
  )
  select b.d,
         b.hg,
         -- Tatilse ve geçmişte aynı türden en az bir örnek varsa onu kullan, yoksa hafta günü.
         round(coalesce(case when b.tatil_turu is not null and b.t_ornek > 0 then b.t_kisi else b.w_kisi end, 0), 1),
         round(coalesce(case when b.tatil_turu is not null and b.t_ornek > 0 then b.t_ciro else b.w_ciro end, 0), 2),
         coalesce(case when b.tatil_turu is not null and b.t_ornek > 0 then b.t_ornek else b.w_ornek end, 0),
         case
           -- Tatil ama geçmiş örnek yok: rakam hafta gününden geliyor, güvenilmez.
           when b.tatil_turu is not null and coalesce(b.t_ornek, 0) = 0 then 'dusuk'
           when b.tatil_turu is not null and b.t_ornek < 2 then 'dusuk'
           when b.tatil_turu is not null and b.t_sapma / b.t_ort > 0.35 then 'orta'
           when b.tatil_turu is not null then 'orta'
           when coalesce(b.w_ornek, 0) < 2 then 'dusuk'
           when b.w_ort is null then 'dusuk'
           when b.w_sapma / b.w_ort > 0.35 then 'orta'
           when coalesce(b.w_ornek, 0) >= 4 then 'yuksek'
           else 'orta'
         end,
         b.tatil_adi,
         b.tatil_turu,
         case
           when b.tatil_turu is not null and coalesce(b.t_ornek, 0) > 0 then 'benzer_tatil'
           when b.tatil_turu is not null then 'tatil_veri_yok'
           else 'hafta_gunu'
         end
  from birlesik b
  order by b.d;
$$;

-- staffing_plan tahmini olduğu gibi kullanıyor; tatil bilgisini ekrana taşıyabilmek için
-- iki kolon daha geçiriyor. Hesap mantığı değişmedi.
create function staffing_plan(p_restaurant uuid, p_days_ahead int default 7)
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
  confidence            text,
  holiday_name          text,
  basis                 text
)
language sql
stable
as $$
  with saatler as (
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
         round(case when o.kisi_basi_saat > 0 then f.predicted_covers / o.kisi_basi_saat / 8.0 else null end, 1),
         round(case when o.kisi_basi_saat > 0 then (f.predicted_covers / o.kisi_basi_saat) * o.saat_maliyeti else null end, 2),
         round(case when o.kisi_basi_saat > 0 and f.predicted_revenue > 0
                    then ((f.predicted_covers / o.kisi_basi_saat) * o.saat_maliyeti) / f.predicted_revenue * 100
                    else null end, 1),
         coalesce((select yuzde from hedef), 30),
         f.confidence,
         f.holiday_name,
         f.basis
  from sales_forecast(p_restaurant, p_days_ahead) f
  cross join oran o
  order by f.forecast_date;
$$;
