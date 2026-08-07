-- check_in_arrival: yeni bir walk-in kaydı açılırken (mevcut bir "bekleniyor" rezervasyonla
-- eşleşmiyorsa) created_by ve iletisim_kanali de dolsun (Gökhan, 2026-08-07 — İstatistikler
-- sayfası). Mevcut bir rezervasyonla eşleşip sadece "geldi" işaretleniyorsa BUNLARA
-- dokunulmaz — o rezervasyon zaten daha önce, başka biri tarafından, başka bir kanaldan
-- alınmış olabilir.
drop function if exists check_in_arrival(uuid, text, int, text, text, uuid);

create or replace function check_in_arrival(
  p_restaurant uuid, p_guest_name text, p_party_size int,
  p_guest_phone text default null, p_note text default null, p_kisi_karti_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  update reservations
  set status = 'geldi', arrived_at = now(), kisi_karti_id = coalesce(reservations.kisi_karti_id, p_kisi_karti_id)
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
    insert into reservations (
      restaurant_id, guest_name, guest_phone, party_size, reserved_at, status, arrived_at, note,
      consent_at, source, kisi_karti_id, iletisim_kanali, created_by
    )
    values (
      p_restaurant, p_guest_name, nullif(trim(coalesce(p_guest_phone, '')), ''),
      greatest(coalesce(p_party_size, 1), 1), now(), 'geldi', now(),
      nullif(trim(coalesce(p_note, '')), ''),
      case when trim(coalesce(p_guest_phone, '')) <> '' then now() else null end,
      'kapi', p_kisi_karti_id, 'yuz_yuze', auth.uid()
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
