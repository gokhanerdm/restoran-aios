-- İstasyonlar (Mutfak, Bar, Pastane gibi) — KDS ekranının hangi kalemi hangi ekranda
-- göstereceğini belirler. dining_areas ile aynı mantık: işletmeci serbestçe ekler/siler.
create table stations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  name          text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_stations_restaurant on stations(restaurant_id);

-- Kategori varsayılan istasyonu (örn. Ana Yemekler → Mutfak, İçecekler → Bar).
alter table menu_categories add column default_station_id uuid references stations(id) on delete set null;
-- Ürün bazlı override — boşsa kategori varsayılanı kullanılır (Menü ekranındaki
-- vat_rate/target_food_cost_percent kategori-varsayılan + ürün-override deseniyle aynı).
alter table menu_items add column station_override_id uuid references stations(id) on delete set null;
