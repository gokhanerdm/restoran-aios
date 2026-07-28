-- Masa servisi simülasyonu — Faz 1 (ROADMAP §O1, §O11).
--
-- İki temel değişiklik:
-- 1) Masa durum zinciri genişliyor: hesap kapanınca masa artık DİREKT boşalmıyor
--    (üç moddan basit hariç). Yeni durumlar: kasa_bekliyor (garson parayı aldı, kasa
--    onayı bekliyor), toplanacak (kasa onayladı, masa temizlenecek).
-- 2) EN KRİTİK KURAL (Gökhan, 2026-07-28): "Garson parayı kasaya teslim etmeden masa
--    kapanmaz." Ödeme tamamlandığında adisyon artık DİREKT kapanmıyor; 'pending_cashier'
--    durumuna düşüyor. Kasa onaylayınca 'closed' oluyor. Bu, gün sonu mutabakatını masa
--    masa yapıyor — yanlış alma/sayma müşteri hâlâ oradayken ortaya çıkıyor.
--
-- Masa durumu değişikliklerinin tamamı bir trigger ile otomatik loglanıyor
-- (table_status_events) — hem "masa ne kadar sürede toplandı" ölçümü hem de ileride
-- şef aksaklık raporu için. RPC'lerin ayrıca log yazmasına gerek yok.

alter table restaurant_settings add column if not exists table_flow_mode text not null default 'basit'
  check (table_flow_mode in ('basit', 'garson_takipli', 'karsilamali'));
comment on column restaurant_settings.table_flow_mode is
  'basit: hesap kapanınca masa direkt boş. garson_takipli: toplanacak->hazır zinciri, karşılama yok. karsilamali: tam zincir, karşılama sadece hazır masaları görür.';

alter table restaurant_tables drop constraint if exists restaurant_tables_status_check;
alter table restaurant_tables add constraint restaurant_tables_status_check
  check (status in ('empty', 'occupied', 'bill_requested', 'reserved', 'kasa_bekliyor', 'toplanacak'));

alter table restaurant_tables add column if not exists became_toplanacak_at timestamptz;

create table if not exists table_status_events (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  table_id      uuid not null references restaurant_tables(id),
  from_status   text,
  to_status     text not null,
  changed_at    timestamptz not null default now()
);
create index if not exists idx_table_status_events_restaurant on table_status_events(restaurant_id, changed_at);
create index if not exists idx_table_status_events_table on table_status_events(table_id, changed_at);

create or replace function trg_log_table_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    insert into table_status_events (restaurant_id, table_id, from_status, to_status)
    values (new.restaurant_id, new.id, old.status, new.status);
    if new.status = 'toplanacak' then
      new.became_toplanacak_at := now();
    elsif old.status = 'toplanacak' then
      new.became_toplanacak_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restaurant_tables_status on restaurant_tables;
create trigger trg_restaurant_tables_status
before update on restaurant_tables
for each row execute function trg_log_table_status_change();

-- Ödeme toplandı ↔ kasa onayladı ayrımı.
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('open', 'pending_cashier', 'closed', 'cancelled', 'transferred'));

alter table orders add column if not exists payment_collected_at timestamptz;
alter table orders add column if not exists payment_collected_by uuid references staff_members(id);
alter table orders add column if not exists cashier_confirmed_at timestamptz;
alter table orders add column if not exists cashier_confirmed_by uuid references staff_members(id);
alter table orders add column if not exists cashier_note text;

-- Masayı aç — TableOrderPanel'in elle yaptığı insert+update'in yerini alıyor; hem "masa
-- gerçekten müsait mi" kontrolünü tek yerde topluyor hem de ileride Karşılama ekranının
-- aynı yoldan geçmesini sağlıyor (iki ayrı kod aynı işi yapmasın diye).
create or replace function open_table_order(p_restaurant_id uuid, p_table_id uuid, p_party_size int, p_staff_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
  v_status text;
begin
  select status into v_status from restaurant_tables where id = p_table_id and restaurant_id = p_restaurant_id and deleted_at is null;
  if v_status is null then
    raise exception 'Masa bulunamadı';
  end if;
  if v_status <> 'empty' then
    raise exception 'Masa müsait değil (durum: %)', v_status;
  end if;
  if exists (select 1 from orders where table_id = p_table_id and status = 'open') then
    raise exception 'Bu masada zaten açık bir sipariş var';
  end if;

  insert into orders (restaurant_id, table_id, status, channel, party_size)
  values (p_restaurant_id, p_table_id, 'open', 'dine_in', greatest(1, p_party_size))
  returning id into v_order_id;

  update restaurant_tables set status = 'occupied', updated_at = now() where id = p_table_id;

  return v_order_id;
end;
$$;

-- Garson ödemeyi tamamladı — adisyon kasaya devrediliyor, henüz KAPANMIYOR.
create or replace function mark_order_payment_collected(p_order_id uuid, p_staff_id uuid default null)
returns void
language plpgsql
as $$
declare
  v_table uuid;
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_discounts numeric(12,2);
begin
  select table_id into v_table from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_total from order_items where order_id = p_order_id and status = 'active';
  select coalesce(sum(amount), 0) into v_discounts from order_discounts where order_id = p_order_id;
  v_total := greatest(0, v_total - v_discounts);

  select coalesce(sum(amount), 0) into v_paid from order_payments where order_id = p_order_id;
  if v_paid + 0.001 < v_total then
    raise exception 'Ödeme tamamlanmadan kasaya devredilemez (kalan %)', round(v_total - v_paid, 2);
  end if;

  update orders set status = 'pending_cashier', payment_collected_at = now(), payment_collected_by = p_staff_id, updated_at = now()
  where id = p_order_id;

  if v_table is not null then
    update restaurant_tables set status = 'kasa_bekliyor', updated_at = now() where id = v_table;
  end if;
end;
$$;

-- Kasa onayladı — adisyon burada KAPANIYOR. Masa, işletmenin akış moduna göre
-- ya direkt boşalır (basit) ya da toplanacak'a düşer (garson_takipli / karsilamali).
create or replace function confirm_cashier_payment(p_order_id uuid, p_staff_id uuid default null, p_note text default null)
returns void
language plpgsql
as $$
declare
  v_table uuid;
  v_rest uuid;
  v_mode text;
  v_total numeric(12,2);
  v_discounts numeric(12,2);
begin
  select table_id, restaurant_id into v_table, v_rest from orders where id = p_order_id and status = 'pending_cashier';
  if not found then
    raise exception 'Kasa onayı bekleyen sipariş bulunamadı';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_total from order_items where order_id = p_order_id and status = 'active';
  select coalesce(sum(amount), 0) into v_discounts from order_discounts where order_id = p_order_id;
  v_total := greatest(0, v_total - v_discounts);

  update orders set status = 'closed', closed_at = now(), total_amount = v_total,
    cashier_confirmed_at = now(), cashier_confirmed_by = p_staff_id, cashier_note = p_note, updated_at = now()
  where id = p_order_id;

  if v_table is not null then
    select table_flow_mode into v_mode from restaurant_settings where restaurant_id = v_rest;
    if coalesce(v_mode, 'basit') = 'basit' then
      update restaurant_tables set status = 'empty', updated_at = now() where id = v_table;
    else
      update restaurant_tables set status = 'toplanacak', updated_at = now() where id = v_table;
    end if;
  end if;
end;
$$;

-- Garson masayı topladı, temizledi — "hazır" (empty) olarak işaretliyor.
-- Sadece 'toplanacak' durumundaki masada çalışır; başka bir şeyi yanlışlıkla boşaltmaz.
create or replace function mark_table_ready(p_table_id uuid)
returns void
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from restaurant_tables where id = p_table_id;
  if v_status is distinct from 'toplanacak' then
    return;
  end if;
  update restaurant_tables set status = 'empty', updated_at = now() where id = p_table_id;
end;
$$;

-- Kasa ekranı — hangi garsonda ne kadar teslim edilmemiş para var. Kişi bazında.
create or replace function pending_cashier_orders(p_restaurant uuid)
returns table (
  order_id             uuid,
  table_id             uuid,
  table_name           text,
  total_amount         numeric,
  payment_collected_at timestamptz,
  staff_id             uuid,
  staff_name           text,
  minutes_waiting      numeric
)
language sql
stable
as $$
  select o.id,
         o.table_id,
         coalesce(rt.name, 'Ayrık hesap'),
         greatest(0,
           coalesce((select sum(oi.quantity * oi.unit_price) from order_items oi where oi.order_id = o.id and oi.status = 'active'), 0)
           - coalesce((select sum(d.amount) from order_discounts d where d.order_id = o.id), 0)
         ),
         o.payment_collected_at,
         o.payment_collected_by,
         coalesce(sm.full_name, 'Bilinmiyor'),
         round(extract(epoch from (now() - o.payment_collected_at)) / 60.0, 1)
  from orders o
  left join restaurant_tables rt on rt.id = o.table_id
  left join staff_members sm on sm.id = o.payment_collected_by
  where o.restaurant_id = p_restaurant and o.status = 'pending_cashier'
  order by o.payment_collected_at;
$$;
