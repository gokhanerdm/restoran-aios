-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- Salonlar: Salon, Bahçe, VIP gibi alanlar — kullanıcı ekler, masalar altına girer
create table dining_areas (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  name          text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_dining_areas_restaurant on dining_areas(restaurant_id);

alter table restaurant_tables add column area_id uuid references dining_areas(id);
alter table restaurant_tables add column sort_order int not null default 0;
