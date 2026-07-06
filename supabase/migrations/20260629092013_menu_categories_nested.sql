-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- Alt kategori desteği: kategori kendi içinde alt kategori barındırabilir
alter table menu_categories add column parent_id uuid references menu_categories(id);
create index idx_menu_categories_parent on menu_categories(parent_id);
