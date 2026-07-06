-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- Stok başlıkları: Mutfak, Bar, Depo, Sarf vb. — kullanıcı ekler
create table stock_groups (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  name          text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_stock_groups_restaurant on stock_groups(restaurant_id);

alter table ingredients add column stock_group_id uuid references stock_groups(id);
