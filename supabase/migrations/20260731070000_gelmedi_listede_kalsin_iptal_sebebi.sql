-- Gökhan: "gelmedi diye işaretlenenler listede kalsın ama en alta düşsün, iptal edilenlere
-- de iptal sebebi girilsin." Liste tarafı (görünürlük/sıralama) client'ta (karsilama/page.tsx)
-- değişiyor; burada sadece iptal sebebini tutacak sütun ve onu yazan RPC var.
--
-- ÖNEMLİ (bir önceki migration'da yaşanan hatadan ders): "create or replace" farklı
-- parametre sayısını AYNI fonksiyon saymıyor, eskisinin yanına ikinci bir aşırı yüklenmiş
-- sürüm ekliyor — bu da "is not unique" hatasına yol açıyor (check_in_arrival'da olduğu
-- gibi). Bu yüzden eski 2 parametreli set_reservation_status'u önce açıkça siliyoruz.
alter table reservations add column if not exists cancel_reason text;

drop function if exists set_reservation_status(uuid, text);

create or replace function set_reservation_status(p_reservation_id uuid, p_status text, p_cancel_reason text default null)
returns void
language plpgsql
as $$
declare
  v_table uuid;
begin
  update reservations
  set status = p_status,
      arrived_at = case when p_status = 'geldi' then now() else arrived_at end,
      cancel_reason = case when p_status = 'iptal' then nullif(trim(coalesce(p_cancel_reason, '')), '') else cancel_reason end
  where id = p_reservation_id
  returning table_id into v_table;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if p_status in ('iptal', 'gelmedi') and v_table is not null then
    update restaurant_tables set status = 'empty', reservation_note = null
    where id = v_table and status = 'reserved';
  end if;
end;
$$;
