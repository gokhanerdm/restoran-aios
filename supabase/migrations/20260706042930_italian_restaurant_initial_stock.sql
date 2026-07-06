-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- NOT: Demo veri seed'i (Osteria Bella açılış stoğu) — şema değişikliği değildir.
-- Açılış alışveriş listesi: her yemekten 15 porsiyon varsayımıyla toplam malzeme ihtiyacı,
-- gerçek satın alma + stok hareketi olarak işlenir (Stok ekranında görünür).
do $$
declare
  v_rest uuid;
  v_purchase uuid;
  r record;
begin
  select id into v_rest from restaurants where slug = 'merkez';

  insert into purchases (restaurant_id, supplier_id, total_amount, source, purchased_at)
  values (v_rest, null, 0, 'manuel', now())
  returning id into v_purchase;

  for r in (
    select ri.ingredient_id, sum(ri.quantity) * 15 as need_qty, i.current_unit_cost, i.unit
    from recipe_items ri
    join ingredients i on i.id = ri.ingredient_id
    where ri.restaurant_id = v_rest
    group by ri.ingredient_id, i.current_unit_cost, i.unit
  ) loop
    insert into purchase_items (restaurant_id, purchase_id, ingredient_id, quantity, unit_price)
    values (v_rest, v_purchase, r.ingredient_id, r.need_qty, r.current_unit_cost);

    insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id)
    values (v_rest, r.ingredient_id, 'purchase', r.need_qty, r.current_unit_cost, 'purchase', v_purchase);
  end loop;

  update purchases set total_amount = (
    select coalesce(sum(quantity * unit_price), 0) from purchase_items where purchase_id = v_purchase
  ) where id = v_purchase;
end $$;

select i.name, i.unit, round(sum(sm.quantity), 2) as alinan_miktar, i.current_unit_cost,
       round(sum(sm.quantity) * i.current_unit_cost, 2) as tutar
from stock_movements sm
join ingredients i on i.id = sm.ingredient_id
group by i.name, i.unit, i.current_unit_cost
order by tutar desc;
