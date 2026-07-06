-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- NOT: Demo veri seed'i (Osteria Bella menü ürünleri) — şema değişikliği değildir.
insert into menu_items (restaurant_id, category_id, name, sale_price, vat_rate, sort_order)
select r.id, c.id, x.name, x.price, 10, x.sort_order
from restaurants r
cross join (values
  ('ANTIPASTI', 'Bruschetta Al Pomodoro', 180.0, 0),
  ('ANTIPASTI', 'Caprese Salatası', 220.0, 1),
  ('ANTIPASTI', 'Carpaccio Di Manzo', 280.0, 2),
  ('PIZZA', 'Margherita', 260.0, 0),
  ('PIZZA', 'Quattro Formaggi', 320.0, 1),
  ('PIZZA', 'Diavola', 300.0, 2),
  ('PIZZA', 'Prosciutto E Funghi', 310.0, 3),
  ('PASTA', 'Spaghetti Aglio E Olio', 220.0, 0),
  ('PASTA', 'Fettuccine Alfredo', 260.0, 1),
  ('PASTA', 'Penne Arrabbiata', 230.0, 2),
  ('PASTA', 'Linguine Alle Vongole', 380.0, 3),
  ('PASTA', 'Lazanya', 290.0, 4),
  ('ANA YEMEKLER', 'Ossobuco', 480.0, 0),
  ('ANA YEMEKLER', 'Pollo Alla Parmigiana', 350.0, 1),
  ('ANA YEMEKLER', 'Salmone Alla Griglia', 420.0, 2),
  ('TATLILAR', 'Tiramisu', 180.0, 0),
  ('TATLILAR', 'Panna Cotta', 160.0, 1),
  ('TATLILAR', 'Cannoli', 170.0, 2),
  ('İÇECEKLER', 'Espresso', 60.0, 0),
  ('İÇECEKLER', 'Cappuccino', 80.0, 1),
  ('İÇECEKLER', 'San Pellegrino', 70.0, 2),
  ('İÇECEKLER', 'Limonata', 60.0, 3),
  ('ŞARAPLAR', 'Chianti (Kadeh)', 220.0, 0),
  ('ŞARAPLAR', 'Pinot Grigio (Kadeh)', 200.0, 1),
  ('ŞARAPLAR', 'Prosecco (Kadeh)', 210.0, 2)
) as x(cat, name, price, sort_order)
join menu_categories c on c.restaurant_id = r.id and c.name = x.cat
where r.slug = 'merkez';
