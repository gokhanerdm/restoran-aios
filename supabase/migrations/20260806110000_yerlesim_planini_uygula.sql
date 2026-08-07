-- Yerleşim planını TEK SEFERDE uygula (Gökhan, 2026-08-06: "listede rezervasyonlar olmasına
-- rağmen masalara yerleşmemiş, ama listede yerleşti görünüyor").
--
-- Sebep sıraydı: plan uygulanırken rezervasyonlar tek tek assign_reservation_tables'a
-- gönderiliyordu. A masasını B'ye devrederken, B'nin ataması önce çalışırsa masa hâlâ
-- A'da "reserved" göründüğü için işaretlenmiyor; sonra A'nın ataması çalışıp o masayı
-- boşa çıkarıyordu. Sonuçta masa B'ye bağlı ama durumu "boş" kalıyordu.
--
-- Çözüm: plandaki bütün rezervasyonların masaları ÖNCE topluca bırakılıyor, sonra hepsi
-- birden yazılıyor. Tek işlem olduğu için arada tutarsız bir an oluşmuyor.
create or replace function apply_seating_plan(p_restaurant uuid, p_plan jsonb)
returns void
language plpgsql
as $$
declare
  v_ids uuid[];
  v_kayit jsonb;
  v_rez uuid;
  v_masalar uuid[];
  v_note text;
begin
  select coalesce(array_agg((x->>'reservation_id')::uuid), '{}') into v_ids
  from jsonb_array_elements(p_plan) as x;
  if array_length(v_ids, 1) is null then return; end if;

  -- 1) Plandaki rezervasyonların tuttuğu masaları bırak (oturulan masaya dokunma).
  update restaurant_tables rt
  set status = 'empty', reservation_note = null, updated_at = now()
  where rt.restaurant_id = p_restaurant
    and rt.status = 'reserved'
    and rt.id in (select table_id from reservation_tables where reservation_id = any (v_ids));
  delete from reservation_tables where reservation_id = any (v_ids);

  -- 2) Yeni planı yaz.
  for v_kayit in select * from jsonb_array_elements(p_plan) loop
    v_rez := (v_kayit->>'reservation_id')::uuid;
    select coalesce(array_agg((t)::uuid), '{}') into v_masalar
    from jsonb_array_elements_text(v_kayit->'table_ids') as t;
    if array_length(v_masalar, 1) is null then continue; end if;

    insert into reservation_tables (reservation_id, table_id)
    select v_rez, m from unnest(v_masalar) as m
    on conflict do nothing;

    update reservations set table_id = v_masalar[1] where id = v_rez;

    select to_char(reserved_at at time zone 'Europe/Istanbul', 'HH24:MI') || ' · ' || guest_name || ' · ' || party_size || ' kişi'
    into v_note from reservations where id = v_rez;

    -- "sadece boşsa işaretle" değil, "misafir oturmuyorsa işaretle": masa o an başka bir
    -- rezervasyonda görünüyorsa atlanıyordu, sonra o rezervasyon masayı bırakınca masa
    -- rezerve edilmiş rezervasyona bağlı olduğu hâlde boş renkte kalıyordu (Gökhan:
    -- "isim gelmiş ama dolu rengi yok").
    update restaurant_tables
    set status = 'reserved', reservation_note = v_note, updated_at = now()
    where id = any (v_masalar) and restaurant_id = p_restaurant and status <> 'occupied';
  end loop;
end;
$$;
