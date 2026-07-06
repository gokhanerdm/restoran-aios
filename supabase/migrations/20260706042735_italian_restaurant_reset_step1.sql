-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- NOT: Bu ve sonraki 3 migration şema değil, DEMO VERİ sıfırlama/seed'idir
-- (mevcut demo kayıtları siler, "Osteria Bella" İtalyan restoranı demo verisiyle değiştirir).
-- 1) Eski demo veriyi temizle (FK sırasına göre)
delete from order_items;
delete from orders;
delete from stock_movements;
delete from purchase_items;
delete from purchases;
delete from purchase_requests;
delete from recipe_items;
delete from product_variants;
delete from menu_item_modifier_groups;
delete from modifiers;
delete from modifier_groups;
delete from menu_items;
delete from menu_categories;
delete from ingredients;
delete from stock_groups;

-- 2) Restoranı İtalyan konseptine çevir
update restaurants set name = 'Osteria Bella' where slug = 'merkez';

-- 3) Kategori ağacı
insert into menu_categories (restaurant_id, name, sort_order)
select id, x.name, x.sort_order from restaurants r, (values
  ('ANTIPASTI', 0), ('PIZZA', 1), ('PASTA', 2), ('ANA YEMEKLER', 3),
  ('TATLILAR', 4), ('İÇECEKLER', 5), ('ŞARAPLAR', 6)
) as x(name, sort_order)
where r.slug = 'merkez';

-- 4) Malzemeler (kalori/diyet/alerjen ile)
insert into ingredients (restaurant_id, name, unit, current_unit_cost, kcal_per_unit, diet_class, allergens, par_level)
select r.id, x.name, x.unit, x.cost, x.kcal, x.diet, x.allerg, x.par
from restaurants r, (values
  ('Un (Tip 00)', 'kg', 25.0, 3640, 'bitkisel', array['Gluten'], 10.0),
  ('Domates', 'kg', 30.0, 180, 'bitkisel', array[]::text[], 8.0),
  ('Domates Sosu', 'kg', 35.0, 290, 'bitkisel', array[]::text[], 6.0),
  ('Mozzarella Peyniri', 'kg', 220.0, 2800, 'hayvansal', array['Süt'], 8.0),
  ('Parmesan Peyniri', 'kg', 380.0, 3920, 'hayvansal', array['Süt'], 4.0),
  ('Zeytinyağı', 'lt', 180.0, 8840, 'bitkisel', array[]::text[], 5.0),
  ('Sarımsak', 'kg', 60.0, 1490, 'bitkisel', array[]::text[], 2.0),
  ('Fesleğen', 'kg', 200.0, 220, 'bitkisel', array[]::text[], 1.0),
  ('Dana Biftek', 'kg', 480.0, 2500, 'et', array[]::text[], 5.0),
  ('İtalyan Salamı', 'kg', 350.0, 3010, 'et', array[]::text[], 3.0),
  ('Mantar', 'kg', 90.0, 220, 'bitkisel', array[]::text[], 4.0),
  ('Sivri Biber', 'kg', 40.0, 400, 'bitkisel', array[]::text[], 2.0),
  ('Kuru Makarna', 'kg', 45.0, 3710, 'bitkisel', array['Gluten'], 12.0),
  ('Tereyağı', 'kg', 260.0, 7170, 'hayvansal', array['Süt'], 4.0),
  ('Krema', 'lt', 150.0, 3400, 'hayvansal', array['Süt'], 6.0),
  ('Yumurta', 'adet', 4.0, 70, 'hayvansal', array['Yumurta'], 60.0),
  ('Midye', 'kg', 220.0, 860, 'et', array['Kabuklu deniz'], 3.0),
  ('Dana But', 'kg', 520.0, 2200, 'et', array[]::text[], 4.0),
  ('Tavuk Göğsü', 'kg', 180.0, 1650, 'et', array[]::text[], 5.0),
  ('Somon', 'kg', 420.0, 2080, 'et', array['Balık'], 4.0),
  ('Maskarpone', 'kg', 260.0, 3290, 'hayvansal', array['Süt'], 3.0),
  ('Ricotta Peyniri', 'kg', 190.0, 1740, 'hayvansal', array['Süt'], 3.0),
  ('Espresso Kahvesi', 'kg', 900.0, 2000, 'bitkisel', array[]::text[], 2.0),
  ('Süt', 'lt', 30.0, 640, 'hayvansal', array['Süt'], 15.0),
  ('Toz Şeker', 'kg', 35.0, 3870, 'bitkisel', array[]::text[], 8.0),
  ('Kakao Tozu', 'kg', 220.0, 2280, 'bitkisel', array[]::text[], 1.0),
  ('Limon', 'kg', 45.0, 290, 'bitkisel', array[]::text[], 3.0),
  ('Maden Suyu', 'adet', 25.0, 0, 'bitkisel', array[]::text[], 24.0),
  ('Chianti Şarabı', 'lt', 320.0, 830, 'bitkisel', array[]::text[], 6.0),
  ('Pinot Grigio', 'lt', 300.0, 820, 'bitkisel', array[]::text[], 6.0),
  ('Prosecco', 'lt', 340.0, 780, 'bitkisel', array[]::text[], 6.0),
  ('Baget Ekmek', 'adet', 15.0, 900, 'bitkisel', array['Gluten'], 10.0)
) as x(name, unit, cost, kcal, diet, allerg, par)
where r.slug = 'merkez';
