-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- Malzeme bazlı beklenen tüketim / sipariş ihtiyacı
-- Mantık: "tek yemek 200 tabak satılacakmış gibi değil" — bu malzemeyi kullanan
-- TÜM reçetelerin son 28 günlük ortalama günlük satışı toplanıp malzeme ihtiyacına çevrilir.
create or replace function ingredient_expected_usage(p_restaurant uuid, p_days_ahead int default 7)
returns table (
  ingredient_id uuid,
  ingredient_name text,
  category text,
  unit text,
  current_stock numeric,
  avg_daily_usage numeric,
  expected_usage numeric,
  supplier_id uuid,
  supplier_name text
)
language sql
as $$
  with stock_now as (
    select sm.ingredient_id, sum(sm.quantity) as qty
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
    group by sm.ingredient_id
  ),
  recent_usage as (
    -- son 28 gündeki gerçek tüketim (consumption + waste), günlük ortalama
    select sm.ingredient_id, sum(-sm.quantity) / 28.0 as avg_daily
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
      and sm.movement_type in ('consumption', 'waste')
      and sm.occurred_at >= now() - interval '28 days'
    group by sm.ingredient_id
  )
  select
    i.id, i.name, i.category, i.unit,
    coalesce(sn.qty, 0),
    coalesce(ru.avg_daily, 0),
    coalesce(ru.avg_daily, 0) * p_days_ahead,
    i.supplier_id, s.name
  from ingredients i
  left join stock_now sn on sn.ingredient_id = i.id
  left join recent_usage ru on ru.ingredient_id = i.id
  left join suppliers s on s.id = i.supplier_id
  where i.restaurant_id = p_restaurant and i.deleted_at is null
  order by i.name;
$$;

-- Yarının hazırlık raporu: geçen haftaların aynı günüyle kıyaslama + kritik stok uyarısı
create or replace function daily_prep_report(p_restaurant uuid)
returns json
language plpgsql
as $$
declare
  v_tomorrow date := (now() at time zone 'Europe/Istanbul')::date + 1;
  v_dow int := extract(isodow from v_tomorrow);
  v_is_holiday boolean;
  v_avg_customers numeric;
  v_last_same_day numeric;
  result json;
begin
  select exists(select 1 from public_holidays where holiday_date = v_tomorrow) into v_is_holiday;

  -- son 4 hafta, yarınla aynı haftanın günü (Pazartesi ise geçmiş Pazartesiler...) müşteri ortalaması
  select avg(daily_count) into v_avg_customers
  from (
    select (o.opened_at at time zone 'Europe/Istanbul')::date as d,
           sum(o.party_size) as daily_count
    from orders o
    where o.restaurant_id = p_restaurant
      and extract(isodow from (o.opened_at at time zone 'Europe/Istanbul')) = v_dow
      and (o.opened_at at time zone 'Europe/Istanbul')::date >= v_tomorrow - interval '35 days'
    group by 1
  ) x;

  select daily_count into v_last_same_day
  from (
    select (o.opened_at at time zone 'Europe/Istanbul')::date as d,
           sum(o.party_size) as daily_count
    from orders o
    where o.restaurant_id = p_restaurant
      and extract(isodow from (o.opened_at at time zone 'Europe/Istanbul')) = v_dow
      and (o.opened_at at time zone 'Europe/Istanbul')::date < v_tomorrow
    group by 1 order by 1 desc limit 1
  ) y;

  select json_build_object(
    'tarih', v_tomorrow,
    'resmi_tatil', coalesce(v_is_holiday, false),
    'beklenen_musteri', round(coalesce(v_avg_customers, 0)),
    'gecen_hafta_ayni_gun', coalesce(v_last_same_day, 0),
    'kritik_stoklar', (
      select coalesce(json_agg(json_build_object(
        'malzeme', i.name, 'mevcut', i.current_unit_cost, 'par_seviye', i.par_level
      )), '[]')
      from ingredients i
      where i.restaurant_id = p_restaurant and i.deleted_at is null
        and exists (
          select 1 from stock_movements sm where sm.ingredient_id = i.id
          group by sm.ingredient_id having sum(sm.quantity) <= i.par_level
        )
    )
  ) into result;
  return result;
end;
$$;
