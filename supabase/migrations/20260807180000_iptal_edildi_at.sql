-- İptal İSTATİSTİKLERİ için: iptalin NE ZAMAN yapıldığı hiç kaydedilmiyordu (sadece "status
-- iptal" biliniyordu, rezervasyondan kaç saat/gün önce iptal edildiği hesaplanamıyordu).
-- Gökhan, 2026-08-07.
alter table reservations add column if not exists cancelled_at timestamptz;

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
      cancel_reason = case when p_status = 'iptal' then nullif(trim(coalesce(p_cancel_reason, '')), '') else cancel_reason end,
      cancelled_at = case when p_status = 'iptal' then now() else cancelled_at end
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
