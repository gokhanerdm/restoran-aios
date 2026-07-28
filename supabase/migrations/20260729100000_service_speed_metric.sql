-- ROADMAP §O8: "yemek hazır olduktan kaç dakika sonra masaya gitti — mutfak mı yavaş,
-- servis mi yavaş, şu an ayrılamıyor." İki ayrı ortalama ile ikisini birbirinden ayırır:
-- sent_at->ready_at (mutfağın hazırlama süresi) ve ready_at->served_at (garsonun masaya
-- götürme süresi). Bugün (Europe/Istanbul günü) teslim edilmiş kalemler üzerinden.
create or replace function service_speed_today(p_restaurant uuid)
returns table(avg_prep_minutes numeric, avg_service_minutes numeric, items_measured int)
language sql
stable
as $$
  select
    round(avg(extract(epoch from (oi.ready_at - oi.sent_at)) / 60)::numeric, 1) as avg_prep_minutes,
    round(avg(extract(epoch from (oi.served_at - oi.ready_at)) / 60)::numeric, 1) as avg_service_minutes,
    count(*)::int as items_measured
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.restaurant_id = p_restaurant
    and oi.status in ('active', 'ikram')
    and oi.sent_at is not null and oi.ready_at is not null and oi.served_at is not null
    and (oi.served_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
$$;
