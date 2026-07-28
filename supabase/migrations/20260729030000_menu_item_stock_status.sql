-- Ürün bitti (86) otomasyonu — ROADMAP §O7.
--
-- Gökhan: "program bunu otomatik yapacak, son 3 siparişe yetecek ürün kaldığında tespit
-- edip uyarmaya başlayacak." Sistem elle "bitti" demeyi beklemiyor; stoktan kaç porsiyon
-- çıkabileceğini hesaplayıp kendisi karar veriyor.
--
-- Bilinçli tasarım kararı: bu durum CANLI hesaplanır, bir tabloya yazılıp güne göre
-- sıfırlanmaz. Stoğa mal girer girmez (fatura/alış kaydedilir) ürün o anda tekrar
-- satılabilir hâle döner — "gün kapanınca açılır" beklemenin gerek yok, gerçek stok
-- ne diyorsa o geçerli. is_active (kalıcı menüden kaldırma) ile karışmaz; bu tamamen ayrı
-- ve otomatik bir katman.
--
-- Porsiyon sayısı = reçetedeki EN KIT malzemenin verdiği porsiyon (en zayıf halka).
-- Reçetesi olmayan ürünler bu hesaba hiç girmez (servings_left = null → sınırsız sayılır,
-- tıpkı bugüne kadar olduğu gibi).

create or replace function menu_items_stock_status(p_restaurant uuid)
returns table (
  menu_item_id  uuid,
  servings_left numeric,
  is_86d        boolean,
  low_stock     boolean
)
language sql
stable
as $$
  with stock_now as (
    select sm.ingredient_id, sum(sm.quantity) as qty
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
    group by sm.ingredient_id
  ),
  per_item as (
    select ri.menu_item_id,
           min(floor(coalesce(sn.qty, 0) / nullif(ri.quantity, 0))) as servings_left
    from recipe_items ri
    left join stock_now sn on sn.ingredient_id = ri.ingredient_id
    where ri.restaurant_id = p_restaurant
    group by ri.menu_item_id
  )
  select mi.id,
         p.servings_left,
         coalesce(p.servings_left <= 0, false),
         coalesce(p.servings_left > 0 and p.servings_left <= 3, false)
  from menu_items mi
  left join per_item p on p.menu_item_id = mi.id
  where mi.restaurant_id = p_restaurant and mi.deleted_at is null;
$$;
