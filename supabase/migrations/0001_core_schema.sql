-- Restoran AIOS — Katman 1 (Restoran OS) çekirdek şema
-- MVP: sipariş, masa, menü, reçete, stok, fire/kaçak, kâr
-- Multi-tenant: her tabloda restaurant_id. Tüm zaman damgaları timestamptz (Europe/Istanbul UI tarafında).
-- Not: RLS V0'da bilinçli kapalı (henüz canlı veri yok). V1'de restaurant_id bazlı eklenecek.

-- ============================================================
-- 1. İŞLETME & KULLANICI
-- ============================================================

create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  timezone      text not null default 'Europe/Istanbul',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id),
  full_name     text,
  role          text not null check (role in ('admin', 'garson')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_profiles_restaurant on profiles(restaurant_id);

-- ============================================================
-- 2. MENÜ
-- ============================================================

create table menu_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  name          text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_menu_categories_restaurant on menu_categories(restaurant_id);

create table menu_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  category_id   uuid references menu_categories(id),
  name          text not null,
  sale_price    numeric(12,2) not null check (sale_price >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_menu_items_restaurant on menu_items(restaurant_id);
create index idx_menu_items_category on menu_items(category_id);

-- ============================================================
-- 3. STOK & REÇETE (kâr/fire motoru)
-- ============================================================

create table ingredients (
  id                     uuid primary key default gen_random_uuid(),
  restaurant_id          uuid not null references restaurants(id),
  name                   text not null,
  unit                   text not null check (unit in ('kg', 'lt', 'adet')),
  -- Fire toleransı: et %3 → 10 kg'da 300 gr eksik normal kabul edilir, fazlası kaçak uyarısı
  waste_tolerance_percent numeric(5,2) not null default 0 check (waste_tolerance_percent >= 0),
  -- Son alış birim maliyeti — kâr ve fire TL hesabı bundan
  current_unit_cost      numeric(12,4) not null default 0 check (current_unit_cost >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create index idx_ingredients_restaurant on ingredients(restaurant_id);

-- Reçete: 1 porsiyon menü ürünü kaç birim malzeme tüketir
create table recipe_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  menu_item_id  uuid not null references menu_items(id),
  ingredient_id uuid not null references ingredients(id),
  quantity      numeric(12,4) not null check (quantity > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (menu_item_id, ingredient_id)
);
create index idx_recipe_items_restaurant on recipe_items(restaurant_id);
create index idx_recipe_items_menu_item on recipe_items(menu_item_id);

-- Tüm stok hareketleri tek defterde — Katman 2 AI'nın yakıtı
create table stock_movements (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  ingredient_id uuid not null references ingredients(id),
  -- purchase: alış (+) | consumption: reçete tüketimi (-) | waste: bilinen fire (-) | count_adjustment: sayım düzeltmesi (+/-)
  movement_type text not null check (movement_type in ('purchase', 'consumption', 'waste', 'count_adjustment')),
  quantity      numeric(12,4) not null,  -- işaretli: giriş +, çıkış -
  unit_cost     numeric(12,4) not null default 0,
  -- Hareketin kaynağı: hangi sipariş/alış/sayım tetikledi
  source_type   text check (source_type in ('order', 'purchase', 'count', 'manual')),
  source_id     uuid,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index idx_stock_movements_restaurant on stock_movements(restaurant_id);
create index idx_stock_movements_ingredient on stock_movements(ingredient_id);
create index idx_stock_movements_occurred on stock_movements(occurred_at);

-- ============================================================
-- 4. ALIŞ / TEDARİK (Katman 3 marketplace köprüsü)
-- ============================================================

create table purchases (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  supplier_name text,
  purchased_at  timestamptz not null default now(),
  total_amount  numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_purchases_restaurant on purchases(restaurant_id);

create table purchase_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  purchase_id   uuid not null references purchases(id),
  ingredient_id uuid not null references ingredients(id),
  quantity      numeric(12,4) not null check (quantity > 0),
  unit_price    numeric(12,4) not null check (unit_price >= 0),
  created_at    timestamptz not null default now()
);
create index idx_purchase_items_restaurant on purchase_items(restaurant_id);
create index idx_purchase_items_purchase on purchase_items(purchase_id);

-- ============================================================
-- 5. SAYIM (sayımdan sayıma fire/kaçak)
-- ============================================================

create table inventory_counts (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  counted_at    timestamptz not null default now(),
  note          text,
  created_at    timestamptz not null default now()
);
create index idx_inventory_counts_restaurant on inventory_counts(restaurant_id);

create table inventory_count_items (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id),
  count_id         uuid not null references inventory_counts(id),
  ingredient_id    uuid not null references ingredients(id),
  counted_quantity numeric(12,4) not null check (counted_quantity >= 0),
  created_at       timestamptz not null default now(),
  unique (count_id, ingredient_id)
);
create index idx_inventory_count_items_restaurant on inventory_count_items(restaurant_id);
create index idx_inventory_count_items_count on inventory_count_items(count_id);

-- ============================================================
-- 6. OPERASYON (masa & sipariş)
-- ============================================================

create table restaurant_tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  name          text not null,
  area          text,
  status        text not null default 'empty' check (status in ('empty', 'occupied', 'bill_requested')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_restaurant_tables_restaurant on restaurant_tables(restaurant_id);

create table orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  table_id      uuid references restaurant_tables(id),
  status        text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  total_amount  numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_orders_restaurant on orders(restaurant_id);
create index idx_orders_table on orders(table_id);
create index idx_orders_status on orders(status);

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  order_id      uuid not null references orders(id),
  menu_item_id  uuid not null references menu_items(id),
  quantity      int not null check (quantity > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  status        text not null default 'active' check (status in ('active', 'void')),
  created_at    timestamptz not null default now()
);
create index idx_order_items_restaurant on order_items(restaurant_id);
create index idx_order_items_order on order_items(order_id);
