-- "kalkti" durumu "tamamlandi" oldu (Gökhan, 2026-08-06).
--
-- Sadece ekrandaki yazıyı değiştirmiyoruz: kural, kısıt, durumu yazan fonksiyonlar ve eski
-- kayıtlar da çevriliyor — "yaptığım değişikliklerin yüzeysel değişmesini istemiyorum,
-- veritabanında da değişsin. Bu programı müşterilerin kullanımına vereceğiz, sorun yaratacak
-- hiçbir şey bırakmamalıyız."
--
-- Sıra önemli: önce kısıt gevşetilir, sonra veri çevrilir, en son kısıt yeni değerle kurulur.
alter table reservations drop constraint if exists reservations_status_check;

update reservations set status = 'tamamlandi' where status = 'kalkti';

alter table reservations add constraint reservations_status_check
  check (status in ('bekleniyor', 'geldi', 'oturdu', 'tamamlandi', 'gelmedi', 'iptal'));

-- Ziyareti bitiren fonksiyon — masaları boşaltır, akışı kapatır.
create or replace function end_reservation_visit(p_reservation_id uuid)
returns void
language plpgsql
as $$
declare
  v_masa_id uuid;
begin
  update reservations
  set status = 'tamamlandi', left_at = now()
  where id = p_reservation_id and status = 'oturdu';
  if not found then
    raise exception 'Oturan bir rezervasyon bulunamadı';
  end if;

  for v_masa_id in select table_id from reservation_tables where reservation_id = p_reservation_id loop
    update restaurant_tables
    set status = 'empty', reservation_note = null, updated_at = now()
    where id = v_masa_id;
  end loop;
end;
$$;

create or replace function set_reservation_status(p_reservation_id uuid, p_status text, p_cancel_reason text default null)
returns void
language plpgsql
as $$
declare
  v_masa_id uuid;
begin
  update reservations
  set status = p_status,
      arrived_at = case when p_status = 'geldi' then now() else arrived_at end,
      left_at    = case when p_status = 'tamamlandi' then now() else left_at end,
      cancel_reason = case when p_status = 'iptal' then nullif(trim(coalesce(p_cancel_reason, '')), '') else cancel_reason end
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
end;
$$;
