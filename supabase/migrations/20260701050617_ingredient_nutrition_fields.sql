-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- Malzeme başına besin/etiket bilgisi (otomasyonun kaynağı)
alter table ingredients add column kcal_per_unit numeric(10,2) not null default 0;
-- bitkisel = vegan; hayvansal = süt/yumurta/bal (vejetaryen ok, vegan değil); et = et/balık
alter table ingredients add column diet_class text not null default 'bitkisel'
  check (diet_class in ('bitkisel', 'hayvansal', 'et'));
alter table ingredients add column allergens text[] not null default '{}';

-- Ürüne elle kalori override (laboratuvar/resmi değer varsa); boşsa reçeteden hesaplanır
alter table menu_items add column calorie_override numeric(10,2);
