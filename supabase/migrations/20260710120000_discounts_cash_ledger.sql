-- Faz 0: İndirim + kasa defteri + gün kapanışı (ROADMAP H bölümü, Gökhan onayı 2026-07-10).

-- 1) İndirimler — kalem (order_item_id dolu) veya adisyon geneli (order_item_id boş).
--    Her indirim sebep+zaman kaydıyla iz bırakır; yetki kontrolü Faz 2'de PIN ile bağlanır.
create table order_discounts (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  order_id      uuid not null references orders(id),
  order_item_id uuid references order_items(id),
  amount        numeric(12,2) not null check (amount > 0),  -- hesaplanmış TL indirimi
  percent       numeric(5,2),                               -- yüzde girildiyse bilgi amaçlı
  reason        text,
  created_at    timestamptz not null default now()
);
create index idx_order_discounts_restaurant on order_discounts(restaurant_id);
create index idx_order_discounts_order on order_discounts(order_id);

-- 2) Kasa hareketleri — nakit satışlar BURAYA YAZILMAZ (order_payments'ta; tek kaynak kuralı).
--    devir: gün başı açılış bakiyesi | giris: elle nakit girişi | cikis: masraf/tedarikçi/bankaya götürme
create table cash_movements (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  movement_type text not null check (movement_type in ('devir', 'giris', 'cikis')),
  amount        numeric(12,2) not null check (amount > 0),
  note          text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index idx_cash_movements_restaurant on cash_movements(restaurant_id);
create index idx_cash_movements_occurred on cash_movements(occurred_at);

-- 3) Gün kapanışları — gece sayımının kalıcı kaydı; ertesi günün deviri counted_cash'ten açılır.
create table day_closures (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  closure_date  date not null,
  expected_cash numeric(12,2) not null default 0,
  counted_cash  numeric(12,2) not null default 0,
  difference    numeric(12,2) not null default 0,  -- counted - expected (eksik negatif)
  note          text,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, closure_date)
);
create index idx_day_closures_restaurant on day_closures(restaurant_id);

-- 4) close_order: ciro artık indirimler düşülerek hesaplanır (Gün Sonu mutabakatı için şart).
create or replace function close_order(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_total numeric(12,2);
  v_discounts numeric(12,2);
  v_table uuid;
  v_rest uuid;
begin
  select table_id, restaurant_id into v_table, v_rest
  from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  -- ciro: sadece active kalemler (ikram gelire sayılmaz)
  select coalesce(sum(quantity * unit_price), 0) into v_total
  from order_items where order_id = p_order_id and status = 'active';

  -- indirimler düşülür (kalem + adisyon geneli); ciro negatife inmez
  select coalesce(sum(amount), 0) into v_discounts
  from order_discounts where order_id = p_order_id;
  v_total := greatest(0, v_total - v_discounts);

  -- stok tüketimi: active + ikram (ikram da mutfaktan çıktı, maliyeti var)
  insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id)
  select v_rest, ri.ingredient_id, 'consumption',
         -(ri.quantity * oi.quantity), i.current_unit_cost, 'order', p_order_id
  from order_items oi
  join recipe_items ri on ri.menu_item_id = oi.menu_item_id
  join ingredients i on i.id = ri.ingredient_id
  where oi.order_id = p_order_id and oi.status in ('active', 'ikram');

  update orders set status = 'closed', closed_at = now(), total_amount = v_total, updated_at = now()
  where id = p_order_id;

  if v_table is not null then
    update restaurant_tables set status = 'empty', updated_at = now() where id = v_table;
  end if;
end;
$$;
