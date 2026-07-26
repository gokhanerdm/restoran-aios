-- close_order'a opsiyonel personel kimliği eklendi — kim kapattıysa (garson) o kaydedilir,
-- profil/özet sayfası kişi başı ciro ve "kaç masaya hizmet etti" hesabını buradan alacak.
-- p_staff_id default null: Kasa (PC, gerçek sahip girişi) hâlâ eskisi gibi çağırabilir.
create or replace function close_order(p_order_id uuid, p_staff_id uuid default null)
returns void
language plpgsql
as $function$
declare
  v_total numeric(12,2);
  v_discounts numeric(12,2);
  v_table uuid;
  v_rest uuid;
begin
  select table_id, restaurant_id into v_table, v_rest
  from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_total
  from order_items where order_id = p_order_id and status = 'active';

  select coalesce(sum(amount), 0) into v_discounts
  from order_discounts where order_id = p_order_id;
  v_total := greatest(0, v_total - v_discounts);

  insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id)
  select v_rest, ri.ingredient_id, 'consumption',
         -(ri.quantity * oi.quantity), i.current_unit_cost, 'order', p_order_id
  from order_items oi
  join recipe_items ri on ri.menu_item_id = oi.menu_item_id
  join ingredients i on i.id = ri.ingredient_id
  where oi.order_id = p_order_id and oi.status in ('active', 'ikram');

  update orders set status = 'closed', closed_at = now(), total_amount = v_total, updated_at = now(),
    closed_by_staff_id = p_staff_id
  where id = p_order_id;

  if v_table is not null then
    update restaurant_tables set status = 'empty', updated_at = now() where id = v_table;
  end if;
end;
$function$
