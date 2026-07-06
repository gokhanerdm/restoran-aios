-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- Sipariş satırına seçilen varyant
alter table order_items add column variant_id uuid references product_variants(id);

-- Sipariş satırında seçilen ek seçenekler (modifier) — fiyat farkı anlık kopyalanır
create table order_item_modifiers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  order_item_id uuid not null references order_items(id) on delete cascade,
  modifier_id   uuid references modifiers(id),
  name          text not null,
  price_delta   numeric(12,2) not null default 0,
  created_at    timestamptz not null default now()
);
create index idx_order_item_modifiers_item on order_item_modifiers(order_item_id);
create index idx_order_item_modifiers_restaurant on order_item_modifiers(restaurant_id);
