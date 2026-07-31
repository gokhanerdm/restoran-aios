-- "Rezervasyon dışı" (doğrudan giriş) formu sadece isim+kişi sayısı alıyordu; Karşılama'nın
-- "Yeni rezervasyon" formuyla aynı bilgileri (telefon, not) toplamıyordu (Gökhan: "rezervasyon
-- dışı kayıt ekranı da rezervasyonda alınan bilgileri almalı"). check_in_arrival telefon/not
-- parametrelerini opsiyonel alacak şekilde genişletildi — add_valet_entry'nin pozisyonel
-- (3 parametreli) çağrısı varsayılanlarla aynen çalışmaya devam eder.
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
    insert into reservations (restaurant_id, guest_name, guest_phone, party_size, reserved_at, status, arrived_at, note, consent_at)
    values (
      p_restaurant, p_guest_name, nullif(trim(coalesce(p_guest_phone, '')), ''),
      greatest(coalesce(p_party_size, 1), 1), now(), 'geldi', now(),
      nullif(trim(coalesce(p_note, '')), ''),
      case when trim(coalesce(p_guest_phone, '')) <> '' then now() else null end
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
