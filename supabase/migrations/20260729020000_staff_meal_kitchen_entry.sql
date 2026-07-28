-- Personel yemeği mutfaktan girilir — ROADMAP §O13, Gökhan: "personel yemeğinin masada
-- ne işi var, mutfaktan girilir". order_items.status = 'personel' zaten vardı
-- (2026-07-28 gecesi eklenmişti); eksik olan bu kalemlerin hangi 'orders' satırı altında
-- duracağıydı — order_items.order_id NOT NULL.
--
-- Çözüm: restoran başına, hiç kapanmayan tek bir "personel" siparişi. staff_meal_cost RPC'si
-- zaten order'ın durumuna bakmıyor (sadece order_items.status='personel' + tarih filtreliyor),
-- o yüzden bu siparişin sonsuza dek 'open' kalması hiçbir raporu bozmaz — ciro/kâr hesapları
-- channel='dine_in' ve status='closed' arıyor, bu sipariş ikisine de girmiyor.
--
-- orders.channel kısıtı yalnızca satış kanallarını biliyordu (dine_in/paket/…); 'personel'
-- bir satış kanalı değil ama aynı kolonu kullanmak (yeni bir ayrım tablosu açmak yerine)
-- en basit yol. party_size>0 kısıtı olduğu için 1 yazılıyor — gerçek bir misafir sayısı değil,
-- hiçbir raporda kullanılmıyor (bu sipariş zaten hiçbir yerde dine_in/closed olarak sayılmıyor).
alter table orders drop constraint if exists orders_channel_check;
alter table orders add constraint orders_channel_check
  check (channel = any (array['dine_in', 'paket', 'yemeksepeti', 'getir', 'trendyol', 'personel']));

create or replace function get_or_create_staff_meal_order(p_restaurant_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  select id into v_order_id from orders
  where restaurant_id = p_restaurant_id and channel = 'personel' and status = 'open'
  limit 1;

  if v_order_id is not null then
    return v_order_id;
  end if;

  insert into orders (restaurant_id, table_id, status, channel, party_size)
  values (p_restaurant_id, null, 'open', 'personel', 1)
  returning id into v_order_id;

  return v_order_id;
end;
$$;
