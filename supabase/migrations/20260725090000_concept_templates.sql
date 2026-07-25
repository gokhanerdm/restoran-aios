-- Konsept şablon kütüphanesi — Faz 1, AI'sız kurulum sihirbazı.
-- Global, hiçbir restaurant_id'ye bağlı değil: biz araştırıp dolduruyoruz (dönerci, pizzacı, kebapçı...),
-- her yeni işletme kayıt olunca buradan konsept seçip tek tıkla menü+reçete+malzeme kurabiliyor.
-- İleride gerçek AI sohbet katmanı geldiğinde de aynı tablolardan (RAG kaynağı olarak) beslenecek.

create table concept_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table concept_categories (
  id          uuid primary key default gen_random_uuid(),
  concept_id  uuid not null references concept_templates(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0
);
create index idx_concept_categories_concept on concept_categories(concept_id);

create table concept_ingredients (
  id                      uuid primary key default gen_random_uuid(),
  concept_id              uuid not null references concept_templates(id) on delete cascade,
  name                    text not null,
  unit                    text not null check (unit in ('kg', 'lt', 'adet')),
  default_unit_cost       numeric(12,4) not null default 0,
  waste_tolerance_percent numeric(5,2) not null default 0
);
create index idx_concept_ingredients_concept on concept_ingredients(concept_id);

create table concept_items (
  id              uuid primary key default gen_random_uuid(),
  concept_id      uuid not null references concept_templates(id) on delete cascade,
  category_id     uuid not null references concept_categories(id) on delete cascade,
  name            text not null,
  suggested_price numeric(12,2) not null default 0,
  sort_order      int not null default 0
);
create index idx_concept_items_concept on concept_items(concept_id);
create index idx_concept_items_category on concept_items(category_id);

create table concept_recipe_items (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references concept_items(id) on delete cascade,
  ingredient_id uuid not null references concept_ingredients(id) on delete cascade,
  quantity      numeric(12,4) not null check (quantity > 0),
  unique (item_id, ingredient_id)
);
create index idx_concept_recipe_items_item on concept_recipe_items(item_id);

-- Bir konsepti bir restorana uygular: kategori + malzeme + ürün + reçete tek seferde atomik kurulur.
-- İsim eşleşiyorsa (aynı isimde zaten var olan kategori/malzeme/ürün) atlanır — iki kez çağrılsa da
-- ya da işletmeci elle bir şey eklemiş olsa da yinelenmiş kayıt oluşmaz.
create or replace function apply_concept_template(p_restaurant_id uuid, p_concept_id uuid)
returns void
language plpgsql
as $$
begin
  insert into menu_categories (restaurant_id, name, sort_order)
  select p_restaurant_id, cc.name, cc.sort_order
  from concept_categories cc
  where cc.concept_id = p_concept_id
    and not exists (
      select 1 from menu_categories mc
      where mc.restaurant_id = p_restaurant_id and mc.name = cc.name and mc.deleted_at is null
    );

  insert into ingredients (restaurant_id, name, unit, current_unit_cost, waste_tolerance_percent)
  select p_restaurant_id, ci.name, ci.unit, ci.default_unit_cost, ci.waste_tolerance_percent
  from concept_ingredients ci
  where ci.concept_id = p_concept_id
    and not exists (
      select 1 from ingredients i
      where i.restaurant_id = p_restaurant_id and i.name = ci.name and i.deleted_at is null
    );

  insert into menu_items (restaurant_id, category_id, name, sale_price, vat_rate, sort_order)
  select p_restaurant_id, mc.id, cit.name, cit.suggested_price, 10, cit.sort_order
  from concept_items cit
  join concept_categories cc on cc.id = cit.category_id
  join menu_categories mc on mc.restaurant_id = p_restaurant_id and mc.name = cc.name and mc.deleted_at is null
  where cit.concept_id = p_concept_id
    and not exists (
      select 1 from menu_items mi
      where mi.restaurant_id = p_restaurant_id and mi.category_id = mc.id and mi.name = cit.name and mi.deleted_at is null
    );

  insert into recipe_items (restaurant_id, menu_item_id, ingredient_id, quantity)
  select p_restaurant_id, mi.id, i.id, cri.quantity
  from concept_recipe_items cri
  join concept_items cit on cit.id = cri.item_id
  join concept_categories cc on cc.id = cit.category_id
  join menu_categories mc on mc.restaurant_id = p_restaurant_id and mc.name = cc.name and mc.deleted_at is null
  join menu_items mi on mi.restaurant_id = p_restaurant_id and mi.category_id = mc.id and mi.name = cit.name and mi.deleted_at is null
  join concept_ingredients ci on ci.id = cri.ingredient_id
  join ingredients i on i.restaurant_id = p_restaurant_id and i.name = ci.name and i.deleted_at is null
  where cit.concept_id = p_concept_id
    and not exists (
      select 1 from recipe_items ri
      where ri.restaurant_id = p_restaurant_id and ri.menu_item_id = mi.id and ri.ingredient_id = i.id
    );
end;
$$;
