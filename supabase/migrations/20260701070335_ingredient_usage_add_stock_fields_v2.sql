-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
drop function if exists ingredient_expected_usage(uuid, int);

create function ingredient_expected_usage(p_restaurant uuid, p_days_ahead int default 7)
returns table (
  ingredient_id uuid,
  ingredient_name text,
  category text,
  unit text,
  par_level numeric,
  current_unit_cost numeric,
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
    select sm.ingredient_id, sum(-sm.quantity) / 28.0 as avg_daily
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
      and sm.movement_type in ('consumption', 'waste')
      and sm.occurred_at >= now() - interval '28 days'
    group by sm.ingredient_id
  )
  select
    i.id, i.name, i.category, i.unit, i.par_level, i.current_unit_cost,
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

create or replace function add_stock_purchase(
  p_restaurant uuid, p_ingredient uuid, p_supplier uuid,
  p_quantity numeric, p_unit_price numeric, p_source text default 'manuel'
)
returns void
language plpgsql
as $$
declare
  v_purchase uuid;
begin
  insert into purchases (restaurant_id, supplier_id, total_amount, source)
  values (p_restaurant, p_supplier, p_quantity * p_unit_price, p_source)
  returning id into v_purchase;

  insert into purchase_items (restaurant_id, purchase_id, ingredient_id, quantity, unit_price)
  values (p_restaurant, v_purchase, p_ingredient, p_quantity, p_unit_price);

  insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id)
  values (p_restaurant, p_ingredient, 'purchase', p_quantity, p_unit_price, 'purchase', v_purchase);

  update ingredients set current_unit_cost = p_unit_price, updated_at = now() where id = p_ingredient;
end;
$$;
