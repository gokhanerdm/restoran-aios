-- Rezervasyon + Karşılama + Vale birleşimi.
--
-- Gökhan: "rezervasyon telefondan geldi... karşılama panelinden mi yapacağız rezervasyon
-- panelinden mi diye soracakken şunu anlıyorum bize bu iki panel gerekli değil, ikisi aslında
-- aynı işlevi yapıyor." Karşılık: tek tablo (reservations genişler, waitlist_entries'in işini
-- de üstlenir), tek ekran (Karşılama — Rezervasyon ayrı sayfa olmaktan çıkar).
--
-- Durum kelime çakışması: eski Rezervasyon'da "bekliyor" = misafir henüz gelmedi; eski
-- Karşılama'da "bekliyor" = misafir kapıda, masa bekliyor. İkisi TERS anlamdaydı — yeni
-- vokabüler: bekleniyor (henüz gelmedi) / geldi (kapıda, masa bekliyor) / oturdu / gelmedi / iptal.
--
-- Vale entegrasyonu: "müşteri geldi, vale anahtarı aldı, bilgileri girdi, rezervasyon karşısına
-- çıktı, geldi işaretlendi, karşılama ekranına düştü" — vale artık GİRİŞTE de devrede (bugüne
-- kadar sadece hesap istenince ÇIKIŞTA araba hazırlama tarafını biliyordu). add_valet_entry
-- isme göre bugünün "bekleniyor" rezervasyonuyla eşleşmeyi dener; bulamazsa yeni bir "geldi"
-- kaydı açar (rezervasyonsuz gelen de aynı akışa girer — ROADMAP §O2 kaydı zorunlu değil ilkesi
-- korunuyor, sadece artık aynı tabloya düşüyor).

alter table reservations add column if not exists arrived_at timestamptz;
alter table reservations add column if not exists seated_at timestamptz;
alter table reservations add column if not exists seated_order_id uuid references orders(id);

alter table reservations drop constraint if exists reservations_status_check;
alter table reservations alter column status set default 'bekleniyor';
update reservations set status = 'bekleniyor' where status = 'bekliyor';
alter table reservations add constraint reservations_status_check
  check (status in ('bekleniyor', 'geldi', 'oturdu', 'gelmedi', 'iptal'));

-- Karşılama'nın "kayıtsız doğrudan gir" ve Vale'nin girişteki isim eşleştirmesi ortak kullanır.
-- Bugünün (Europe/Istanbul) "bekleniyor" rezervasyonlarında isme göre arar; bulursa "geldi"
-- yapar, bulamazsa rezervasyonsuz yeni bir "geldi" kaydı açar. Karar müşterinin/personelin
-- elinde — program sessizce en eski eşleşeni seçer (aynı isimde birden fazla varsa).
create or replace function check_in_arrival(p_restaurant uuid, p_guest_name text, p_party_size int)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  update reservations
  set status = 'geldi', arrived_at = now()
  where id = (
    select id from reservations
    where restaurant_id = p_restaurant and status = 'bekleniyor'
      and (reserved_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date
      and lower(trim(guest_name)) = lower(trim(p_guest_name))
    order by reserved_at asc
    limit 1
  )
  returning id into v_id;

  if v_id is null then
    insert into reservations (restaurant_id, guest_name, party_size, reserved_at, status, arrived_at)
    values (p_restaurant, p_guest_name, greatest(coalesce(p_party_size, 1), 1), now(), 'geldi', now())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Bekleme listesinin (waitlist_entries) yerini reservations alıyor — seat_waitlist_entry'nin
-- yerine geçer. open_table_order'ı sarmalar (Faz 1'deki tek-yerden-kontrol prensibi aynı),
-- ayrıca vale'nin GİRİŞTE bıraktığı ama o an masa bilmediği için bağlayamadığı kaydı
-- (matched_table_id boş) şimdi, misafir gerçekten oturunca, isme göre geriye dönük bağlar.
create or replace function seat_reservation(p_reservation_id uuid, p_table_id uuid, p_staff_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_rest uuid;
  v_party int;
  v_guest_name text;
  v_order_id uuid;
begin
  select restaurant_id, party_size, guest_name into v_rest, v_party, v_guest_name
  from reservations where id = p_reservation_id and status in ('bekleniyor', 'geldi');
  if not found then
    raise exception 'Rezervasyon bulunamadı ya da zaten oturmuş/iptal edilmiş';
  end if;

  v_order_id := open_table_order(v_rest, p_table_id, v_party, p_staff_id);

  update reservations
  set status = 'oturdu', seated_at = now(), table_id = p_table_id, seated_order_id = v_order_id
  where id = p_reservation_id;

  update valet_entries
  set matched_table_id = p_table_id
  where id = (
    select id from valet_entries
    where restaurant_id = v_rest and status = 'bekliyor' and matched_table_id is null
      and lower(trim(guest_name)) = lower(trim(v_guest_name))
    order by parked_at desc
    limit 1
  );

  return v_order_id;
end;
$$;

-- add_valet_entry: artık girişte de çalışıyor. p_party_size verilmişse (girişte vale formu)
-- check_in_arrival'ı tetikler. Eşleştirme hâlâ "zaten oturmuş" (oturdu) rezervasyonlara karşı
-- da denenir — vale kaydı gecikmeli girilirse (misafir vale'den önce içeri girip oturduysa)
-- masa hemen bağlansın diye; asıl beklenen yol artık GİRİŞTE, oturmadan önce.
create or replace function add_valet_entry(p_restaurant uuid, p_guest_name text, p_plate_no text, p_party_size int default null)
returns uuid
language plpgsql
as $$
declare
  v_table uuid;
  v_id uuid;
begin
  select r.table_id into v_table
  from reservations r
  where r.restaurant_id = p_restaurant and r.status = 'oturdu'
    and lower(trim(r.guest_name)) = lower(trim(p_guest_name))
  order by r.seated_at desc
  limit 1;

  insert into valet_entries (restaurant_id, guest_name, plate_no, matched_table_id)
  values (p_restaurant, p_guest_name, p_plate_no, v_table)
  returning id into v_id;

  if p_party_size is not null then
    perform check_in_arrival(p_restaurant, p_guest_name, p_party_size);
  end if;

  return v_id;
end;
$$;

drop function if exists seat_waitlist_entry(uuid, uuid, uuid);
drop table if exists waitlist_entries;
