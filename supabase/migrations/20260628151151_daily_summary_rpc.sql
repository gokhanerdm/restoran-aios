-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
create or replace function daily_summary(p_restaurant uuid, p_date date)
returns json
language plpgsql
as $$
declare
  result json;
begin
  with closed as (
    select o.id, o.total_amount, o.channel
    from orders o
    where o.restaurant_id = p_restaurant
      and o.status = 'closed'
      and (o.closed_at at time zone 'Europe/Istanbul')::date = p_date
  ),
  cost as (
    select coalesce(sum(-sm.quantity * sm.unit_cost), 0) as total_cost
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
      and sm.movement_type = 'consumption'
      and (sm.occurred_at at time zone 'Europe/Istanbul')::date = p_date
  ),
  prod as (
    select mi.id, mi.name,
      sum(oi.quantity * oi.unit_price) as revenue,
      coalesce(sum(oi.quantity * (
        select coalesce(sum(ri.quantity * ing.current_unit_cost), 0)
        from recipe_items ri
        join ingredients ing on ing.id = ri.ingredient_id
        where ri.menu_item_id = mi.id
      )), 0) as cost
    from order_items oi
    join closed c on c.id = oi.order_id
    join menu_items mi on mi.id = oi.menu_item_id
    where oi.status = 'active'
    group by mi.id, mi.name
  )
  select json_build_object(
    'ciro', (select coalesce(sum(total_amount), 0) from closed),
    'maliyet', (select total_cost from cost),
    'adisyon', (select count(*) from closed),
    'kanal', (select coalesce(json_agg(json_build_object('channel', channel, 'ciro', s)), '[]')
              from (select channel, sum(total_amount) s from closed group by channel) k),
    'urunler', (select coalesce(json_agg(json_build_object('name', name, 'kar', round(revenue - cost, 2)) order by (revenue - cost) desc), '[]')
                from prod)
  ) into result;
  return result;
end;
$$;
