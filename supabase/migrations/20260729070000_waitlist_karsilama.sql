-- Bekleme listesi + Karşılama ekranı — ROADMAP §O2.
--
-- Gökhan: isim soyisim + kişi sayısı zorunlu, telefon alınabilirse alınır (vale için de
-- gerekiyor). Sıra sırayla ilerler ama son karar karşılamada. Kayıt zorunlu değil —
-- rezervasyonsuz gelen müşteri isterse hiç kaydedilmeden de oturtulabilir (asıl yol
-- müşteri uygulaması olacak, kayıt orada müşterinin kendi rızasıyla olur).

create table waitlist_entries (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id),
  guest_name      text not null,
  guest_phone     text,
  party_size      int not null check (party_size > 0),
  status          text not null default 'bekliyor' check (status in ('bekliyor', 'oturdu', 'iptal')),
  created_at      timestamptz not null default now(),
  seated_at       timestamptz,
  seated_table_id uuid references restaurant_tables(id),
  seated_order_id uuid references orders(id)
);
create index idx_waitlist_entries_restaurant on waitlist_entries(restaurant_id, status, created_at);

-- Bekleme kaydından oturtma — open_table_order'ı sarmalar (masa müsaitlik kontrolü tek
-- yerde kalsın diye, Faz 1'deki aynı prensip) ve kaydı 'oturdu' işaretler.
create or replace function seat_waitlist_entry(p_entry_id uuid, p_table_id uuid, p_staff_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_rest uuid;
  v_party int;
  v_order_id uuid;
begin
  select restaurant_id, party_size into v_rest, v_party
  from waitlist_entries where id = p_entry_id and status = 'bekliyor';
  if not found then
    raise exception 'Bekleme kaydı bulunamadı ya da zaten oturmuş/iptal edilmiş';
  end if;

  v_order_id := open_table_order(v_rest, p_table_id, v_party, p_staff_id);

  update waitlist_entries
  set status = 'oturdu', seated_at = now(), seated_table_id = p_table_id, seated_order_id = v_order_id
  where id = p_entry_id;

  return v_order_id;
end;
$$;
