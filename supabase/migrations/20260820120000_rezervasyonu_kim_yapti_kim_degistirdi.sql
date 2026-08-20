-- REZERVASYONU KİM YAPTI, KİM DEĞİŞTİRDİ (Gökhan, 2026-08-20: "hepsi tutulsun ama sadece
-- rezervasyon satırına kimin aldığını koyalım").
--
-- created_by (kim aldı) zaten vardı. Yanına izler: kim oturttu, kim geldi işaretledi, kim iptal
-- etti / gelmedi yazdı. Hepsi oturumdan otomatik doluyor, elle seçim yok. Ekranda şimdilik
-- sadece "kim aldı" gösteriliyor; ötekiler istatistik ve sorumluluk takibi için duruyor.
alter table public.reservations
  add column if not exists oturtan uuid references auth.users(id),
  add column if not exists geldi_yazan uuid references auth.users(id),
  add column if not exists iptal_eden uuid references auth.users(id);

comment on column public.reservations.oturtan is 'Misafiri masaya oturtan kullanici.';
comment on column public.reservations.geldi_yazan is 'Geldi olarak isaretleyen kullanici.';
comment on column public.reservations.iptal_eden is 'Iptal ya da gelmedi yazan kullanici.';

-- Durum değişikliğinde izi bırak (gövdenin geri kalanı değişmedi).
create or replace function public.set_reservation_status(p_reservation_id uuid, p_status text, p_cancel_reason text DEFAULT NULL::text)
returns void
language plpgsql
as $function$
declare
  v_masa_id uuid;
begin
  update reservations
  set status = p_status,
      arrived_at = case when p_status = 'geldi' then now() else arrived_at end,
      left_at    = case when p_status = 'tamamlandi' then now() else left_at end,
      cancel_reason = case when p_status = 'iptal' then nullif(trim(coalesce(p_cancel_reason, '')), '') else cancel_reason end,
      cancelled_at = case when p_status = 'iptal' then now() else cancelled_at end,
      geldi_yazan = case when p_status = 'geldi' then coalesce(auth.uid(), geldi_yazan) else geldi_yazan end,
      iptal_eden  = case when p_status in ('iptal','gelmedi') then coalesce(auth.uid(), iptal_eden) else iptal_eden end
  where id = p_reservation_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if p_status in ('iptal', 'gelmedi', 'tamamlandi') then
    for v_masa_id in select table_id from reservation_tables where reservation_id = p_reservation_id loop
      update restaurant_tables
      set status = 'empty', reservation_note = null, updated_at = now()
      where id = v_masa_id and status in ('reserved', 'occupied');
    end loop;
  end if;

  if p_status in ('iptal', 'gelmedi') then
    delete from reservation_tables where reservation_id = p_reservation_id;
    update reservations set table_id = null where id = p_reservation_id;
  end if;
end;
$function$;

-- Oturtmada izi bırak.
create or replace function public.seat_reservation(p_reservation_id uuid, p_table_id uuid, p_staff_id uuid DEFAULT NULL::uuid)
returns uuid
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
  set status = 'oturdu', seated_at = now(), left_at = null, table_id = p_table_id,
      oturtan = coalesce(auth.uid(), oturtan)
  where id = p_reservation_id;

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

-- Kapı girişinde "geldi" izini de bırak.
create or replace function public.check_in_arrival(p_restaurant uuid, p_guest_name text, p_party_size integer, p_guest_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_kisi_karti_id uuid DEFAULT NULL::uuid)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  update reservations
  set status = 'geldi', arrived_at = now(),
      kisi_karti_id = coalesce(reservations.kisi_karti_id, p_kisi_karti_id),
      geldi_yazan = coalesce(auth.uid(), geldi_yazan)
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
      consent_at, source, kisi_karti_id, iletisim_kanali, created_by, geldi_yazan
    )
    values (
      p_restaurant, p_guest_name, nullif(trim(coalesce(p_guest_phone, '')), ''),
      greatest(coalesce(p_party_size, 1), 1), now(), 'geldi', now(),
      nullif(trim(coalesce(p_note, '')), ''),
      case when trim(coalesce(p_guest_phone, '')) <> '' then now() else null end,
      'kapi', p_kisi_karti_id, 'yuz_yuze', auth.uid(), auth.uid()
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;
