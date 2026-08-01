-- Gökhan: "bizim rezervasyon dışı gelen bilgisine de ihtiyacımız var, o da istatistiklerde
-- görünmesi gerekli." Şu ana kadar bir rezervasyonun "gerçek rezervasyon" mu yoksa "kapıdan
-- doğrudan giriş" mi olduğunu ayırt eden bir alan yoktu — reserved_at/created_at'ten tahmin
-- etmek güvenilmezdi. source kayıt oluşturulduğu anda BİR KERE yazılır, durum zinciri
-- (bekleniyor->geldi->oturdu) ilerledikçe değişmez — istatistikte güvenilir kalsın diye.
alter table reservations add column if not exists source text not null default 'rezervasyon'
  check (source in ('rezervasyon', 'kapi'));

-- check_in_arrival'ın INSERT dalı hem "Rezervasyon dışı" formundan (Karşılama) hem de
-- add_valet_entry'nin eşleşme bulamadığı fallback'inden çağrılıyor — ikisi de kapıdan
-- doğrudan giriş demek, tek yerden 'kapi' yazmak yeterli. UPDATE dalı (isim eşleşen mevcut
-- bir "bekleniyor" rezervasyonu bulursa) source'a dokunmuyor — o kayıt zaten gerçek bir
-- rezervasyondu, öyle kalır.
create or replace function check_in_arrival(
  p_restaurant uuid, p_guest_name text, p_party_size int,
  p_guest_phone text default null, p_note text default null
)
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
    insert into reservations (restaurant_id, guest_name, guest_phone, party_size, reserved_at, status, arrived_at, note, consent_at, source)
    values (
      p_restaurant, p_guest_name, nullif(trim(coalesce(p_guest_phone, '')), ''),
      greatest(coalesce(p_party_size, 1), 1), now(), 'geldi', now(),
      nullif(trim(coalesce(p_note, '')), ''),
      case when trim(coalesce(p_guest_phone, '')) <> '' then now() else null end,
      'kapi'
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
