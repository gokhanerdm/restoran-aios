-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
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
        'malzeme', t.name, 'mevcut', t.mevcut, 'par_seviye', t.par_level
      )), '[]')
      from (
        select i.name, i.par_level, coalesce(sum(sm.quantity), 0) as mevcut
        from ingredients i
        left join stock_movements sm on sm.ingredient_id = i.id and sm.restaurant_id = p_restaurant
        where i.restaurant_id = p_restaurant and i.deleted_at is null and i.par_level > 0
        group by i.id, i.name, i.par_level
        having coalesce(sum(sm.quantity), 0) <= i.par_level
      ) t
    )
  ) into result;
  return result;
end;
$$;
