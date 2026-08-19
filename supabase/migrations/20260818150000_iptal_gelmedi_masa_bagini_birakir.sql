-- İPTAL VE GELMEDİ MASA BAĞINI BIRAKIR (Gökhan, 2026-08-18)
--
-- Eskiden iptal/gelmedi olunca masanın rengi boşa dönüyordu ama rezervasyon ile masa
-- arasındaki bağ (reservation_tables) ve reservations.table_id duruyordu. Sonuç: iptal
-- edilen kayıt hâlâ masa tutuyor gibi görünüyor, aynı masa hem iptale hem yeni rezervasyona
-- bağlı kalıyordu (Gökhan: "boş masalarda hâlâ mavi yanıyor").
--
-- Tamamlanan ziyaretin bağı KORUNUYOR: misafir o masada oturdu, geçmiş ve istatistik için
-- hangi masada oturduğu lazım. İptal ve gelmedide masaya hiç oturulmadı.
create or replace function public.set_reservation_status(
  p_reservation_id uuid, p_status text, p_cancel_reason text default null::text
) returns void
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

  -- Masaya hiç oturulmadı: bağ tamamen kalkıyor, masa gerçekten serbest.
  if p_status in ('iptal', 'gelmedi') then
    delete from reservation_tables where reservation_id = p_reservation_id;
    update reservations set table_id = null where id = p_reservation_id;
  end if;
end;
$function$;
