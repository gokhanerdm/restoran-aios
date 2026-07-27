-- Bahşiş + Hesap bölme (split bill)
--
-- 1) BAHŞİŞ
-- Bahşiş ciro DEĞİLDİR: orders.total_amount'a girmez, close_order onu zaten
-- order_items - order_discounts üzerinden hesapladığı için bu kolon oraya hiç
-- karışmaz. Ayrı bir kolonda durur ki "kasaya giren para" ile "ciro" ayrılabilsin
-- (personel hakedişi/rapor ileride buradan okunur).
alter table order_payments add column tip_amount numeric(12,2) not null default 0;

-- 2) HESAP BÖLME
-- Masa birleştirmenin (transfer_table_order) tersi: bir adisyondaki kalemlerin bir
-- kısmı YENİ bir siparişe taşınır.
--
-- İki hedef var:
--   a) Boş bir masa  -> yeni siparişin table_id'si o masa olur, masa 'occupied' olur.
--   b) Aynı masada 2. hesap -> table_id NULL kalır ("ayrık hesap").
--
-- (b)'de table_id'yi NULL bırakmak zorunluyuz: 20260713140231_one_open_order_per_table
-- migration'ı `unique(table_id) where status='open'` koyuyor, yani bir masada iki açık
-- sipariş DB seviyesinde yasak. Ayrıca TableOrderPanel masanın siparişini .maybeSingle()
-- ile çekiyor; ikinci bir satır o ekranı komple bozardı. NULL table_id ile hem index
-- (Postgres'te NULL'lar birbirine eşit sayılmaz) hem de mevcut sorgular hiç etkilenmez.
--
-- Ayrık hesabın hangi masaya ait olduğu split_from_table_id ile tutulur — adisyon
-- ekranı "Ayrılan hesaplar" bloğunu bununla bulur.
alter table orders add column split_from_order_id uuid references orders(id);
alter table orders add column split_from_table_id uuid references restaurant_tables(id);

create index idx_orders_split_from_table on orders(split_from_table_id) where status = 'open';

create or replace function split_order(p_order_id uuid, p_item_ids uuid[], p_new_table_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source orders%rowtype;
  v_new_order_id uuid;
  v_moved int;
begin
  select * into v_source from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    raise exception 'Ayrılacak kalem seçilmedi';
  end if;

  -- Hedef masada zaten açık bir sipariş varsa ayırma yapılamaz (unique index de buna izin
  -- vermezdi, ama hata mesajı anlaşılır olsun diye burada erken yakalıyoruz).
  if p_new_table_id is not null
     and exists (select 1 from orders where table_id = p_new_table_id and status = 'open') then
    raise exception 'Hedef masada zaten açık bir sipariş var';
  end if;

  -- party_size 1: orders tablosunda `check (party_size > 0)` var, 0 yazılamaz.
  -- Ayrılan hesap en az bir kişiyi temsil eder; gerçek kişi sayısını kullanıcı
  -- adisyondan güncelleyebilir. Kaynak siparişin party_size'ı bilerek düşürülmüyor —
  -- masaya kaç kişi oturduğu bilgisi bozulmasın (müşteri sayısı raporları oradan besleniyor).
  insert into orders (restaurant_id, table_id, status, channel, party_size,
                      split_from_order_id, split_from_table_id)
  values (v_source.restaurant_id, p_new_table_id, 'open', v_source.channel, 1,
          v_source.id, v_source.table_id)
  returning id into v_new_order_id;

  -- original_table_id: kalem "aslen hangi masada sipariş edildi" bilgisi. Masa taşımadaki
  -- (transfer_table_order) konvansiyonun aynısı — daha önce doluysa ezilmez.
  update order_items
  set order_id = v_new_order_id,
      original_table_id = coalesce(original_table_id, v_source.table_id)
  where order_id = p_order_id and id = any(p_item_ids);

  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    delete from orders where id = v_new_order_id;
    raise exception 'Seçilen kalemler bu siparişte bulunamadı';
  end if;

  -- Kalem bazlı indirimler kalemle birlikte gider; yoksa kaynakta öksüz kalıp
  -- orada olmayan bir ürünün indirimi olarak toplamı bozardı. Adisyon geneli
  -- indirimler (order_item_id null) kaynakta kalır.
  update order_discounts
  set order_id = v_new_order_id
  where order_id = p_order_id and order_item_id = any(p_item_ids);

  if p_new_table_id is not null then
    update restaurant_tables set status = 'occupied', updated_at = now() where id = p_new_table_id;
  end if;

  -- Kaynak siparişte hiç kalem kalmasa bile onu İPTAL ETMİYORUZ — kullanıcı karar versin
  -- (masayı boşaltmak "Masayı boşalt" butonunun işi).
  return v_new_order_id;
end;
$$;
