-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- Varyant / boy: aynı ürün farklı fiyat (orta/büyük, tek/duble)
create table product_variants (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  menu_item_id  uuid not null references menu_items(id),
  name          text not null,
  sale_price    numeric(12,2) not null check (sale_price >= 0),
  is_default    boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_product_variants_item on product_variants(menu_item_id);
create index idx_product_variants_restaurant on product_variants(restaurant_id);

-- Modifier grubu: "Pişirme", "Ekstralar" (paylaşılabilir, min/max/zorunlu kuralı)
create table modifier_groups (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  name          text not null,
  min_select    int not null default 0,
  max_select    int not null default 1,
  required      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_modifier_groups_restaurant on modifier_groups(restaurant_id);

-- Modifier seçeneği: "Ekstra peynir +10", "Az pişmiş +0"
create table modifiers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  group_id      uuid not null references modifier_groups(id),
  name          text not null,
  price_delta   numeric(12,2) not null default 0,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_modifiers_group on modifiers(group_id);
create index idx_modifiers_restaurant on modifiers(restaurant_id);

-- Ürün ↔ modifier grubu bağı (bir grup birçok ürüne atanır)
create table menu_item_modifier_groups (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  menu_item_id  uuid not null references menu_items(id),
  group_id      uuid not null references modifier_groups(id),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (menu_item_id, group_id)
);
create index idx_mimg_item on menu_item_modifier_groups(menu_item_id);
create index idx_mimg_restaurant on menu_item_modifier_groups(restaurant_id);
