-- İhtiyaç listesi (günlük tahmini sipariş) — "hangi pizza satacağını bilmiyoruz" sorununu
-- ağırlıklı ortalama (beklenen değer) ile çözer: her ürüne bir tahmini günlük satış payı
-- girilir (boşsa kalan pay kategori içindeki diğer boş ürünlere eşit bölünür), sonra
-- kategori için girilen toplam porsiyon sayısına göre her ürünün reçetesi o paya göre
-- çarpılıp malzeme bazında toplanır. Ortak malzemeler (un, mozzarella gibi) farklı
-- ürünlerden gelen miktarlar otomatik toplanarak birleşir.
alter table menu_items add column expected_daily_share numeric(5,2);

create or replace function category_daily_ingredient_needs(p_restaurant_id uuid, p_category_id uuid, p_total_covers int)
returns table (
  ingredient_id uuid,
  ingredient_name text,
  unit text,
  needed_quantity numeric,
  current_stock numeric,
  shortfall numeric,
  unit_cost numeric,
  estimated_cost numeric
)
language plpgsql
as $$
declare
  v_set_sum numeric;
  v_unset_count int;
  v_remaining numeric;
begin
  select coalesce(sum(expected_daily_share), 0), count(*) filter (where expected_daily_share is null)
    into v_set_sum, v_unset_count
  from menu_items
  where restaurant_id = p_restaurant_id and category_id = p_category_id and deleted_at is null and is_active;

  v_remaining := greatest(0, 100 - v_set_sum);

  return query
  with shares as (
    select mi.id as menu_item_id,
      coalesce(mi.expected_daily_share, case when v_unset_count > 0 then v_remaining / v_unset_count else 0 end) as raw_share
    from menu_items mi
    where mi.restaurant_id = p_restaurant_id and mi.category_id = p_category_id and mi.deleted_at is null and mi.is_active
  ),
  total as (
    select coalesce(sum(raw_share), 0) as total_share from shares
  ),
  counts as (
    select s.menu_item_id,
      case when t.total_share > 0 then p_total_covers * s.raw_share / t.total_share else 0 end as est_qty
    from shares s cross join total t
  ),
  needs as (
    select ri.ingredient_id, sum(ri.quantity * c.est_qty) as needed_qty
    from counts c
    join recipe_items ri on ri.menu_item_id = c.menu_item_id
    group by ri.ingredient_id
  ),
  stock as (
    select sm.ingredient_id, coalesce(sum(sm.quantity), 0) as current_stock
    from stock_movements sm
    where sm.restaurant_id = p_restaurant_id
    group by sm.ingredient_id
  )
  select i.id, i.name, i.unit, n.needed_qty,
    coalesce(st.current_stock, 0),
    greatest(0, n.needed_qty - coalesce(st.current_stock, 0)),
    i.current_unit_cost,
    n.needed_qty * i.current_unit_cost
  from needs n
  join ingredients i on i.id = n.ingredient_id
  left join stock st on st.ingredient_id = i.id
  order by n.needed_qty desc;
end;
$$;
