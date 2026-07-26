-- Masa birleştirme — gerçek bill transferi (önceki merged_into_table_id sadece "yönlendirme"ydi,
-- her iki masanın da açık siparişi varsa bunlar hiç birleşmiyordu, kaynağın siparişi asılı kalıyordu).
--
-- Yeni akış: kaynak masanın açık siparişi varsa, kalemleri hedefin siparişine TAŞINIR (order_id
-- değişir), kaynağın kişi sayısı hedefe eklenir, kaynağın siparişi 'transferred' (taşındı) olur —
-- 'cancelled' değil, ayrı bir durum: ne iptal ne kayıp, sadece başka bir siparişe taşınmış demek.
-- Kaynak masa hemen boşalır (yeni müşteri alabilir), kalıcı bir "birleşik" durumda kalmaz.
--
-- Arşiv/rapor için: her kalemde "aslen hangi masada sipariş edildiği" (original_table_id) ayrıca
-- tutulur — kalem hedefin adisyonuna girmiş olsa da, birleşim öncesi kaynakta yazılanlarla birleşim
-- sonrası hedefte yazılanlar ileride ayrı ayrı gösterilebilir.

alter table orders drop constraint orders_status_check;
alter table orders add constraint orders_status_check check (status in ('open', 'closed', 'cancelled', 'transferred'));

alter table order_items add column original_table_id uuid references restaurant_tables(id);

create or replace function transfer_table_order(p_source_table_id uuid, p_target_table_id uuid)
returns void
language plpgsql
as $$
declare
  v_source_order orders%rowtype;
  v_target_order_id uuid;
  v_restaurant_id uuid;
begin
  select * into v_source_order from orders where table_id = p_source_table_id and status = 'open' limit 1;

  if v_source_order.id is null then
    -- Kaynakta açık sipariş yok (iki boş masa birleşiyor) — taşınacak bir şey yok,
    -- eski basit "yönlendirme" davranışı yeterli.
    update restaurant_tables set merged_into_table_id = p_target_table_id where id = p_source_table_id;
    return;
  end if;

  v_restaurant_id := v_source_order.restaurant_id;

  select id into v_target_order_id from orders where table_id = p_target_table_id and status = 'open' limit 1;
  if v_target_order_id is null then
    insert into orders (restaurant_id, table_id, status, channel, party_size)
    values (v_restaurant_id, p_target_table_id, 'open', 'dine_in', 0)
    returning id into v_target_order_id;
    update restaurant_tables set status = 'occupied' where id = p_target_table_id;
  end if;

  update order_items
  set order_id = v_target_order_id, original_table_id = coalesce(original_table_id, p_source_table_id)
  where order_id = v_source_order.id;

  update order_discounts set order_id = v_target_order_id where order_id = v_source_order.id;
  update order_payments set order_id = v_target_order_id where order_id = v_source_order.id;

  update orders set party_size = party_size + v_source_order.party_size where id = v_target_order_id;
  update orders set status = 'transferred', closed_at = now() where id = v_source_order.id;

  -- Kaynak masa kalıcı "birleşik" durumda kalmaz — hemen boşalır, merged_into_table_id de temizlenir
  -- (aksi halde yeni müşteri otursa bile masa hâlâ hedefe yönlendiriyormuş gibi görünürdü).
  update restaurant_tables set status = 'empty', merged_into_table_id = null where id = p_source_table_id;
end;
$$;
