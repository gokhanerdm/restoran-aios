-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- NOT: Demo veri seed'i (Osteria Bella reçeteleri) — şema değişikliği değildir.
insert into recipe_items (restaurant_id, menu_item_id, ingredient_id, quantity)
select r.id, mi.id, ing.id, x.qty
from restaurants r
cross join (values
  ('Bruschetta Al Pomodoro', 'Baget Ekmek', 0.5),
  ('Bruschetta Al Pomodoro', 'Domates', 0.15),
  ('Bruschetta Al Pomodoro', 'Sarımsak', 0.01),
  ('Bruschetta Al Pomodoro', 'Fesleğen', 0.005),
  ('Bruschetta Al Pomodoro', 'Zeytinyağı', 0.02),

  ('Caprese Salatası', 'Mozzarella Peyniri', 0.15),
  ('Caprese Salatası', 'Domates', 0.15),
  ('Caprese Salatası', 'Fesleğen', 0.01),
  ('Caprese Salatası', 'Zeytinyağı', 0.02),

  ('Carpaccio Di Manzo', 'Dana Biftek', 0.12),
  ('Carpaccio Di Manzo', 'Parmesan Peyniri', 0.02),
  ('Carpaccio Di Manzo', 'Zeytinyağı', 0.015),
  ('Carpaccio Di Manzo', 'Limon', 0.02),

  ('Margherita', 'Un (Tip 00)', 0.2),
  ('Margherita', 'Domates Sosu', 0.08),
  ('Margherita', 'Zeytinyağı', 0.01),
  ('Margherita', 'Mozzarella Peyniri', 0.15),
  ('Margherita', 'Fesleğen', 0.005),

  ('Quattro Formaggi', 'Un (Tip 00)', 0.2),
  ('Quattro Formaggi', 'Domates Sosu', 0.08),
  ('Quattro Formaggi', 'Zeytinyağı', 0.01),
  ('Quattro Formaggi', 'Mozzarella Peyniri', 0.1),
  ('Quattro Formaggi', 'Parmesan Peyniri', 0.05),
  ('Quattro Formaggi', 'Ricotta Peyniri', 0.08),

  ('Diavola', 'Un (Tip 00)', 0.2),
  ('Diavola', 'Domates Sosu', 0.08),
  ('Diavola', 'Zeytinyağı', 0.01),
  ('Diavola', 'Mozzarella Peyniri', 0.12),
  ('Diavola', 'İtalyan Salamı', 0.08),
  ('Diavola', 'Sivri Biber', 0.03),

  ('Prosciutto E Funghi', 'Un (Tip 00)', 0.2),
  ('Prosciutto E Funghi', 'Domates Sosu', 0.08),
  ('Prosciutto E Funghi', 'Zeytinyağı', 0.01),
  ('Prosciutto E Funghi', 'Mozzarella Peyniri', 0.12),
  ('Prosciutto E Funghi', 'İtalyan Salamı', 0.06),
  ('Prosciutto E Funghi', 'Mantar', 0.06),

  ('Spaghetti Aglio E Olio', 'Kuru Makarna', 0.12),
  ('Spaghetti Aglio E Olio', 'Sarımsak', 0.02),
  ('Spaghetti Aglio E Olio', 'Zeytinyağı', 0.03),
  ('Spaghetti Aglio E Olio', 'Sivri Biber', 0.01),

  ('Fettuccine Alfredo', 'Kuru Makarna', 0.12),
  ('Fettuccine Alfredo', 'Tereyağı', 0.04),
  ('Fettuccine Alfredo', 'Krema', 0.1),
  ('Fettuccine Alfredo', 'Parmesan Peyniri', 0.04),

  ('Penne Arrabbiata', 'Kuru Makarna', 0.12),
  ('Penne Arrabbiata', 'Domates Sosu', 0.12),
  ('Penne Arrabbiata', 'Sarımsak', 0.015),
  ('Penne Arrabbiata', 'Sivri Biber', 0.02),

  ('Linguine Alle Vongole', 'Kuru Makarna', 0.12),
  ('Linguine Alle Vongole', 'Midye', 0.2),
  ('Linguine Alle Vongole', 'Sarımsak', 0.015),
  ('Linguine Alle Vongole', 'Zeytinyağı', 0.025),

  ('Lazanya', 'Kuru Makarna', 0.1),
  ('Lazanya', 'Dana Biftek', 0.1),
  ('Lazanya', 'Domates Sosu', 0.12),
  ('Lazanya', 'Mozzarella Peyniri', 0.08),
  ('Lazanya', 'Parmesan Peyniri', 0.03),

  ('Ossobuco', 'Dana But', 0.35),
  ('Ossobuco', 'Domates Sosu', 0.1),
  ('Ossobuco', 'Sarımsak', 0.01),

  ('Pollo Alla Parmigiana', 'Tavuk Göğsü', 0.22),
  ('Pollo Alla Parmigiana', 'Mozzarella Peyniri', 0.08),
  ('Pollo Alla Parmigiana', 'Parmesan Peyniri', 0.03),
  ('Pollo Alla Parmigiana', 'Domates Sosu', 0.08),
  ('Pollo Alla Parmigiana', 'Un (Tip 00)', 0.03),

  ('Salmone Alla Griglia', 'Somon', 0.2),
  ('Salmone Alla Griglia', 'Zeytinyağı', 0.015),
  ('Salmone Alla Griglia', 'Limon', 0.02),

  ('Tiramisu', 'Maskarpone', 0.1),
  ('Tiramisu', 'Espresso Kahvesi', 0.01),
  ('Tiramisu', 'Yumurta', 1),
  ('Tiramisu', 'Toz Şeker', 0.03),
  ('Tiramisu', 'Kakao Tozu', 0.005),

  ('Panna Cotta', 'Krema', 0.15),
  ('Panna Cotta', 'Toz Şeker', 0.03),
  ('Panna Cotta', 'Süt', 0.05),

  ('Cannoli', 'Ricotta Peyniri', 0.12),
  ('Cannoli', 'Toz Şeker', 0.03),
  ('Cannoli', 'Un (Tip 00)', 0.05),

  ('Espresso', 'Espresso Kahvesi', 0.008),

  ('Cappuccino', 'Espresso Kahvesi', 0.008),
  ('Cappuccino', 'Süt', 0.1),

  ('San Pellegrino', 'Maden Suyu', 1),

  ('Limonata', 'Limon', 0.08),
  ('Limonata', 'Toz Şeker', 0.02),

  ('Chianti (Kadeh)', 'Chianti Şarabı', 0.15),
  ('Pinot Grigio (Kadeh)', 'Pinot Grigio', 0.15),
  ('Prosecco (Kadeh)', 'Prosecco', 0.15)
) as x(dish, ing, qty)
join menu_items mi on mi.restaurant_id = r.id and mi.name = x.dish
join ingredients ing on ing.restaurant_id = r.id and ing.name = x.ing
where r.slug = 'merkez';
