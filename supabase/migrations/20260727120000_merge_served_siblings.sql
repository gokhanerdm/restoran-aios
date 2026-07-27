-- "Sipariş devamı" ile eklenen kalemler, çift gönderim/kilitlenme riskine karşı bilerek
-- ayrı satır olarak gönderiliyordu (bkz. changeQuantity/compItem düzeltmeleri, 2026-07-27).
-- Ama ikisi de TESLİM EDİLDİKTEN sonra ayrı kalmalarının hiçbir anlamı kalmıyor — adisyonda
-- aynı üründen "4x Kola" ve "1x Kola" diye iki satır görünüyordu. Bu fonksiyon, bir kalem
-- teslim edilirken aynı siparişte aynı ürün/varyant/fiyat/durumda ZATEN teslim edilmiş bir
-- kalem varsa ikisini birleştirir. Modifier'ı (ON DELETE CASCADE — silinen satırın ekstra
-- malzeme kaydı giderdi) ya da indirimi (FK cascade yok — silme hata verirdi) olan kalemler
-- güvenlik için birleştirilmez, ayrı satır olarak kalır.
create or replace function mark_item_served(p_order_item_id uuid, p_staff_id uuid default null)
returns void
language plpgsql
as $function$
declare
  v_order_id uuid;
  v_menu_item uuid;
  v_variant uuid;
  v_price numeric;
  v_status text;
  v_qty int;
  v_updated int;
  v_target_id uuid;
  v_has_modifiers boolean;
  v_has_discount boolean;
begin
  select order_id, menu_item_id, variant_id, unit_price, status, quantity
  into v_order_id, v_menu_item, v_variant, v_price, v_status, v_qty
  from order_items
  where id = p_order_item_id and ready_at is not null and served_at is null;
  if not found then
    return;
  end if;

  update order_items set served_at = now()
  where id = p_order_item_id and served_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return;
  end if;

  select exists(select 1 from order_item_modifiers where order_item_id = p_order_item_id) into v_has_modifiers;
  select exists(select 1 from order_discounts where order_item_id = p_order_item_id) into v_has_discount;
  if v_has_modifiers or v_has_discount then
    return;
  end if;

  select oi.id into v_target_id
  from order_items oi
  where oi.order_id = v_order_id and oi.id <> p_order_item_id
    and oi.menu_item_id = v_menu_item
    and oi.variant_id is not distinct from v_variant
    and oi.unit_price = v_price
    and oi.status = v_status
    and oi.served_at is not null
    and not exists (select 1 from order_item_modifiers m where m.order_item_id = oi.id)
    and not exists (select 1 from order_discounts d where d.order_item_id = oi.id)
  order by oi.created_at
  limit 1;

  if v_target_id is not null then
    update order_items set quantity = quantity + v_qty where id = v_target_id;
    delete from order_items where id = p_order_item_id;
  end if;
end;
$function$;
