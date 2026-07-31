-- Masa planından hızlı rezervasyon — Gökhan: "karşılama/vale modülünü kullanmayacak
-- işletmeler için de böyle bir rezervasyon kutusu gerekecek." Ama iki ayrı veri modeli
-- kurmak yerine TEK model, İKİ giriş kapısı: Karşılama'nın tam formu ya da masa planının
-- hızlı "Rzv" düğmesi — ikisi de aynı reservations tablosuna yazar (tek doğru kaynak).
--
-- Kilit: table_flow_mode = 'karsilamali' olan işletmelerde masa planındaki "Rzv" düğmesi
-- HİÇ görünmez — o modda rezervasyon sadece Karşılama üzerinden girilir (tek kapı,
-- karışıklık olmasın). Basit/garson_takipli modda masa planı kısayolu kalır.

create or replace function quick_reserve_table(p_restaurant uuid, p_table_id uuid, p_guest_name text, p_party_size int, p_reserved_at timestamptz)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into reservations (restaurant_id, guest_name, party_size, reserved_at, table_id)
  values (p_restaurant, p_guest_name, greatest(coalesce(p_party_size, 1), 1), p_reserved_at, p_table_id)
  returning id into v_id;

  perform assign_reservation_table(v_id, p_table_id);
  return v_id;
end;
$$;

-- "Kaldır" — masa planından ya da eskiden not-only olarak flaglenmiş bir masayı temizler.
-- Altında gerçek bir rezervasyon kaydı varsa onu da iptal eder (set_reservation_status zaten
-- masayı boşaltıyor); yoksa (eski/legacy düz bayrak) doğrudan masayı temizler.
create or replace function clear_table_reservation(p_table_id uuid)
returns void
language plpgsql
as $$
declare
  v_res_id uuid;
begin
  select id into v_res_id from reservations
  where table_id = p_table_id and status in ('bekleniyor', 'geldi')
  order by reserved_at desc limit 1;

  if v_res_id is not null then
    perform set_reservation_status(v_res_id, 'iptal');
  else
    update restaurant_tables set status = 'empty', reservation_note = null where id = p_table_id and status = 'reserved';
  end if;
end;
$$;
