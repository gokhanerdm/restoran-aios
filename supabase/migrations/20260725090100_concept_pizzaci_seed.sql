-- İlk konsept şablonu: Pizzacı (Faz 1 pilot — ROADMAP AI Modül ön adımı).
-- Fiyat/malzeme değerleri araştırmaya dayalı yaklaşık başlangıç noktası; işletmeci uyguladıktan
-- sonra hepsini elle düzenleyebilir (bkz. Menü ekranı çift-tıkla-düzenle kuralı).

do $$
declare
  v_concept uuid;
  v_cat_pizza uuid;
  v_cat_icecek uuid;
  v_cat_ekstra uuid;
begin
  insert into concept_templates (name, description, sort_order)
  values ('Pizzacı', 'Taş fırın pizza, içecek ve ekstra sos temel menüsü', 0)
  returning id into v_concept;

  insert into concept_categories (concept_id, name, sort_order) values (v_concept, 'PIZZA', 0) returning id into v_cat_pizza;
  insert into concept_categories (concept_id, name, sort_order) values (v_concept, 'İÇECEKLER', 1) returning id into v_cat_icecek;
  insert into concept_categories (concept_id, name, sort_order) values (v_concept, 'EKSTRA', 2) returning id into v_cat_ekstra;

  insert into concept_ingredients (concept_id, name, unit, default_unit_cost, waste_tolerance_percent)
  values
    (v_concept, 'Pizza Hamuru Unu', 'kg', 22.0, 2),
    (v_concept, 'Domates Sosu', 'kg', 35.0, 3),
    (v_concept, 'Mozzarella Peyniri', 'kg', 220.0, 3),
    (v_concept, 'Sucuk', 'kg', 260.0, 3),
    (v_concept, 'Sosis', 'kg', 180.0, 3),
    (v_concept, 'Mantar', 'kg', 90.0, 5),
    (v_concept, 'Yeşil Biber', 'kg', 40.0, 5),
    (v_concept, 'Mısır', 'kg', 50.0, 5),
    (v_concept, 'Siyah Zeytin', 'kg', 120.0, 3),
    (v_concept, 'Tavuk Göğsü', 'kg', 180.0, 3),
    (v_concept, 'BBQ Sos', 'kg', 90.0, 3),
    (v_concept, 'Zeytinyağı', 'lt', 180.0, 2),
    (v_concept, 'Sarımsak', 'kg', 60.0, 5),
    (v_concept, 'Kola Kutu', 'adet', 15.0, 0),
    (v_concept, 'Ayran', 'adet', 12.0, 0),
    (v_concept, 'Su', 'adet', 5.0, 0);

  insert into concept_items (concept_id, category_id, name, suggested_price, sort_order)
  values
    (v_concept, v_cat_pizza, 'Margherita', 220.0, 0),
    (v_concept, v_cat_pizza, 'Karışık Pizza', 260.0, 1),
    (v_concept, v_cat_pizza, 'Sucuklu Pizza', 250.0, 2),
    (v_concept, v_cat_pizza, 'Tavuklu BBQ Pizza', 270.0, 3),
    (v_concept, v_cat_pizza, 'Vejetaryen Pizza', 240.0, 4),
    (v_concept, v_cat_icecek, 'Kola', 60.0, 0),
    (v_concept, v_cat_icecek, 'Ayran', 45.0, 1),
    (v_concept, v_cat_icecek, 'Su', 25.0, 2),
    (v_concept, v_cat_ekstra, 'Sarımsak Sos', 30.0, 0);

  insert into concept_recipe_items (item_id, ingredient_id, quantity)
  select cit.id, ci.id, x.qty
  from (values
    ('Margherita', 'Pizza Hamuru Unu', 0.25),
    ('Margherita', 'Domates Sosu', 0.09),
    ('Margherita', 'Zeytinyağı', 0.01),
    ('Margherita', 'Mozzarella Peyniri', 0.16),

    ('Karışık Pizza', 'Pizza Hamuru Unu', 0.25),
    ('Karışık Pizza', 'Domates Sosu', 0.09),
    ('Karışık Pizza', 'Mozzarella Peyniri', 0.14),
    ('Karışık Pizza', 'Sucuk', 0.05),
    ('Karışık Pizza', 'Sosis', 0.05),
    ('Karışık Pizza', 'Mantar', 0.04),
    ('Karışık Pizza', 'Yeşil Biber', 0.03),
    ('Karışık Pizza', 'Mısır', 0.03),
    ('Karışık Pizza', 'Siyah Zeytin', 0.02),

    ('Sucuklu Pizza', 'Pizza Hamuru Unu', 0.25),
    ('Sucuklu Pizza', 'Domates Sosu', 0.09),
    ('Sucuklu Pizza', 'Mozzarella Peyniri', 0.15),
    ('Sucuklu Pizza', 'Sucuk', 0.09),
    ('Sucuklu Pizza', 'Yeşil Biber', 0.03),

    ('Tavuklu BBQ Pizza', 'Pizza Hamuru Unu', 0.25),
    ('Tavuklu BBQ Pizza', 'BBQ Sos', 0.08),
    ('Tavuklu BBQ Pizza', 'Mozzarella Peyniri', 0.14),
    ('Tavuklu BBQ Pizza', 'Tavuk Göğsü', 0.1),
    ('Tavuklu BBQ Pizza', 'Mısır', 0.03),

    ('Vejetaryen Pizza', 'Pizza Hamuru Unu', 0.25),
    ('Vejetaryen Pizza', 'Domates Sosu', 0.09),
    ('Vejetaryen Pizza', 'Mozzarella Peyniri', 0.14),
    ('Vejetaryen Pizza', 'Mantar', 0.05),
    ('Vejetaryen Pizza', 'Yeşil Biber', 0.04),
    ('Vejetaryen Pizza', 'Mısır', 0.04),
    ('Vejetaryen Pizza', 'Siyah Zeytin', 0.03),

    ('Kola', 'Kola Kutu', 1),
    ('Ayran', 'Ayran', 1),
    ('Su', 'Su', 1),

    ('Sarımsak Sos', 'Zeytinyağı', 0.03),
    ('Sarımsak Sos', 'Sarımsak', 0.02)
  ) as x(item_name, ing_name, qty)
  join concept_items cit on cit.concept_id = v_concept and cit.name = x.item_name
  join concept_ingredients ci on ci.concept_id = v_concept and ci.name = x.ing_name;
end $$;
