-- Menü sayfası genişletmesi: ürün kaydı + dijital menü kaynağı + maliyet/kârlılık altyapısı.
-- Kullanıcı onayıyla oluşturuldu (2026-07-06). Uygulanmadan önce ayrıca canlı DB onayı istenir.

-- ============================================================
-- A) menu_items — dijital menü kaynağı + kanal + maliyet placeholder alanları
-- ============================================================

alter table menu_items add column description text;
alter table menu_items add column ingredients_text text;
alter table menu_items add column image_url text;
alter table menu_items add column allergens_override text[];

alter table menu_items add column available_dine_in boolean not null default true;
alter table menu_items add column available_takeaway boolean not null default true;
alter table menu_items add column available_quick_sale boolean not null default true;

alter table menu_items add column recommended_price numeric(12,2);
alter table menu_items add column variable_cost_override numeric(12,2);
alter table menu_items add column fixed_cost_share_override numeric(12,2);

-- ============================================================
-- B) menu_categories — kategori bazlı KDV ve hedef food cost
-- ============================================================

alter table menu_categories add column vat_rate numeric(4,1);
alter table menu_categories add column target_food_cost_percent numeric(5,2);

-- ============================================================
-- C) restaurant_settings — "Varsayılan Ayarlar" (restoran başına tek satır)
-- ============================================================

create table restaurant_settings (
  id                              uuid primary key default gen_random_uuid(),
  restaurant_id                   uuid not null references restaurants(id),
  default_vat_rate                numeric(4,1) not null default 10,
  default_menu_design             text not null default 'listeli'
    check (default_menu_design in ('fotografli', 'listeli')),
  default_variable_cost_per_cover numeric(12,2) not null default 0,
  default_fixed_cost_share_percent numeric(5,2) not null default 0,
  role_visibility                 jsonb not null default '{}'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (restaurant_id)
);
create index idx_restaurant_settings_restaurant on restaurant_settings(restaurant_id);

-- ============================================================
-- D) purchase_items — FIFO'ya hazır alan (davranış değişikliği YOK, sadece alan)
-- ============================================================

alter table purchase_items add column remaining_quantity numeric(12,4);
update purchase_items set remaining_quantity = quantity where remaining_quantity is null;
alter table purchase_items alter column remaining_quantity set not null;
alter table purchase_items alter column remaining_quantity set default 0;

-- ============================================================
-- E) profiles.role — şef rolü eklendi (reçete/gramaj/içerik/alerjen görünürlüğü için)
-- ============================================================

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'garson', 'sef'));
