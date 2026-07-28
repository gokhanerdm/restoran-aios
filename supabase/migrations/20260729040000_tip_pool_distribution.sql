-- Bahşiş dağıtımı — puan-saat kuralı (ROADMAP §O12).
--
-- Gökhan: "toplanır toplam puana bölünür, herkes puanına göre alır — 1 puan 3 lira mesela,
-- 3 puanın varsa 9 lira alırsın. Mutfağa bazı yerlerde % verilir bazısında verilmez."
-- Netleştirilen kural: bahşiş GÜNLÜK havuzlanır (haftalık değil — gelmediğin gün zaten
-- havuzda yoksun, "kesilsin mi" tartışması kendiliğinden bitiyor). Önce mutfak yüzdesi
-- ayrılır, kalan salon puan×saat toplamına bölünür; her iki havuz da kendi içinde aynı
-- yöntemle (puan × o günkü çalışma saati) dağıtılır.
--
-- Varsayım (açıkça belirtiliyor): "mutfak" rolü kendi havuzunu alır, diğer TÜM roller
-- (garson/bar/kasa/şef/yönetici) salon havuzunu paylaşır. Bar'ın mutfak mı salon mu
-- sayılacağı işletmeden işletmeye değişebilir — şimdilik salon tarafında, gerekirse
-- ayarlanabilir hâle getirilir.

alter table restaurant_settings add column if not exists tip_points jsonb not null default '{}'::jsonb;
comment on column restaurant_settings.tip_points is
  'Rol -> puan haritası, örn. {"garson": 3, "mutfak": 2, "bar": 2, "kasa": 1, "sef": 4}. Boş rol = 0 puan = pay almaz.';

alter table restaurant_settings add column if not exists kitchen_tip_percent numeric(5,2) not null default 0
  check (kitchen_tip_percent >= 0 and kitchen_tip_percent <= 100);

create or replace function tip_pool_distribution(p_restaurant uuid, p_day date)
returns table (
  staff_id      uuid,
  full_name     text,
  role          text,
  points        numeric,
  hours_worked  numeric,
  point_hours   numeric,
  pool          text,
  share_amount  numeric
)
language plpgsql
stable
as $$
declare
  v_start timestamptz := (p_day::text || ' 00:00:00+03')::timestamptz;
  v_end timestamptz := v_start + interval '1 day';
  v_total_tip numeric;
  v_kitchen_percent numeric;
  v_kitchen_pool numeric;
  v_salon_pool numeric;
  v_points jsonb;
begin
  select coalesce(sum(op.tip_amount), 0) into v_total_tip
  from order_payments op
  where op.restaurant_id = p_restaurant and op.paid_at >= v_start and op.paid_at < v_end;

  select coalesce(kitchen_tip_percent, 0), coalesce(tip_points, '{}'::jsonb)
    into v_kitchen_percent, v_points
  from restaurant_settings where restaurant_id = p_restaurant;

  v_kitchen_pool := round(v_total_tip * coalesce(v_kitchen_percent, 0) / 100.0, 2);
  v_salon_pool := v_total_tip - v_kitchen_pool;

  return query
  with saatler as (
    -- Aynı gün içindeki vardiya süresi; gün sınırının dışına taşan kısım kırpılır
    -- (staff_shift_cost'taki aynı mantık — açık vardiya now()'a kadar sayılır).
    select sh.staff_id as sid,
           sum(greatest(0, extract(epoch from (
             least(coalesce(sh.ended_at, now()), v_end) - greatest(sh.started_at, v_start)
           ))::numeric)) / 3600.0 as saat
    from staff_shifts sh
    where sh.restaurant_id = p_restaurant
      and sh.started_at < v_end
      and coalesce(sh.ended_at, now()) > v_start
    group by sh.staff_id
  ),
  kisi as (
    select sm.id, sm.full_name, sm.role,
           coalesce((v_points ->> sm.role)::numeric, 0) as puan,
           coalesce(s.saat, 0) as saat,
           case when sm.role = 'mutfak' then 'mutfak' else 'salon' end as havuz
    from staff_members sm
    left join saatler s on s.sid = sm.id
    where sm.restaurant_id = p_restaurant and sm.active and sm.deleted_at is null
      and coalesce(s.saat, 0) > 0
  ),
  puan_saat as (
    select *, puan * saat as ps from kisi
  ),
  havuz_toplam as (
    select havuz, sum(ps) as toplam_ps from puan_saat group by havuz
  )
  select k.id, k.full_name, k.role, k.puan, round(k.saat, 2), round(k.ps, 2), k.havuz,
         round(
           case
             when h.toplam_ps > 0 and k.havuz = 'mutfak' then k.ps / h.toplam_ps * v_kitchen_pool
             when h.toplam_ps > 0 and k.havuz = 'salon' then k.ps / h.toplam_ps * v_salon_pool
             else 0
           end, 2) as share_amount
  from puan_saat k
  join havuz_toplam h on h.havuz = k.havuz
  order by k.havuz, share_amount desc;
end;
$$;
