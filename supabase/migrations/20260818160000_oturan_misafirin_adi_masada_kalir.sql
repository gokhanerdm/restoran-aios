-- OTURAN MİSAFİRİN ADI MASADA KALIR (Gökhan, 2026-08-18)
--
-- Masa rezerve edilirken üzerine "21:10 · Ebru Çetin · 4 kişi" yazılıyor, ama misafir
-- oturtulunca bu yazı siliniyordu: salonda dolu masalar isimsiz görünüyor, kimin oturduğu
-- anlaşılmıyordu (Gökhan: "bahçe salonundaki isimsiz dolu masalar nedir"). Artık oturtma da
-- aynı yazıyı koruyor — masa boşalınca (tamamlandı, iptal, gelmedi) yazı zaten temizleniyor.
--
-- Kişi sayısı kapıda girilen GELEN kişi varsa ondan, yoksa rezervasyondaki sayıdan yazılıyor.
create or replace function public.seat_reservation(
  p_reservation_id uuid, p_table_id uuid, p_staff_id uuid default null::uuid
) returns uuid
language plpgsql
as $function$
declare
  v_rest uuid;
  v_guest_name text;
  v_masa_id uuid;
  v_not text;
begin
  select restaurant_id, guest_name into v_rest, v_guest_name
  from reservations where id = p_reservation_id and status in ('bekleniyor', 'geldi');
  if not found then
    raise exception 'Rezervasyon bulunamadı ya da zaten oturmuş/iptal edilmiş';
  end if;

  if exists (
    select 1 from reservations
    where table_id = p_table_id and status = 'oturdu' and id <> p_reservation_id
  ) then
    raise exception 'Bu masada zaten oturan bir misafir var';
  end if;

  insert into reservation_tables (reservation_id, table_id)
  values (p_reservation_id, p_table_id)
  on conflict (reservation_id, table_id) do nothing;

  update reservations
  set status = 'oturdu', seated_at = now(), left_at = null, table_id = p_table_id
  where id = p_reservation_id;

  -- Masanın üzerinde görünecek yazı: saat · isim · kişi (rezervedeki biçimin aynısı).
  select to_char(reserved_at at time zone 'Europe/Istanbul', 'HH24:MI') || ' · ' || guest_name
         || ' · ' || coalesce(gelen_kisi, party_size)::text || ' kişi'
  into v_not
  from reservations where id = p_reservation_id;

  for v_masa_id in select table_id from reservation_tables where reservation_id = p_reservation_id loop
    update restaurant_tables
    set status = 'occupied', reservation_note = v_not, updated_at = now()
    where id = v_masa_id;
  end loop;

  update valet_entries
  set matched_table_id = p_table_id
  where id = (
    select id from valet_entries
    where restaurant_id = v_rest and status = 'bekliyor' and matched_table_id is null
      and lower(trim(guest_name)) = lower(trim(v_guest_name))
    order by parked_at desc
    limit 1
  );

  return p_reservation_id;
end;
$function$;
