-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
create or replace function close_order(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_total numeric(12,2);
  v_table uuid;
  v_rest uuid;
begin
  select table_id, restaurant_id into v_table, v_rest
  from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  -- ciro: sadece active kalemler (ikram gelire sayılmaz)
  select coalesce(sum(quantity * unit_price), 0) into v_total
  from order_items where order_id = p_order_id and status = 'active';

  -- stok tüketimi: active + ikram (ikram da mutfaktan çıktı, maliyeti var)
  insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id)
  select v_rest, ri.ingredient_id, 'consumption',
         -(ri.quantity * oi.quantity), i.current_unit_cost, 'order', p_order_id
  from order_items oi
  join recipe_items ri on ri.menu_item_id = oi.menu_item_id
  join ingredients i on i.id = ri.ingredient_id
  where oi.order_id = p_order_id and oi.status in ('active', 'ikram');

  update orders set status = 'closed', closed_at = now(), total_amount = v_total, updated_at = now()
  where id = p_order_id;

  if v_table is not null then
    update restaurant_tables set status = 'empty', updated_at = now() where id = v_table;
  end if;
end;
$$;
