-- Şef aksaklık paneli — ROADMAP §O9.
--
-- Gökhan: uyarılar şefe gider; ayrıca bir raporda tutulur ama "fişleme aracı değil" —
-- amaç kim suçlu değil, hangi görevde tıkanma var. İşletmeci isterse bakar.
--
-- Canlı görünüm bu turda kapatılıyor. İki madde henüz eksik altyapı istiyor, o yüzden
-- bu RPC'de YOK: "başlangıç teslim edildi, ana yemek gönderilmedi" (servis sırası/coursing
-- henüz yok) ve "garson molada, masaları sahipsiz" (garson ataması/mola henüz yok — aynı
-- gece ilerleyen bir fazda eklenirse bu RPC'ye sonradan UNION ALL ile katılabilir).

create or replace function operational_alerts_live(p_restaurant uuid)
returns table (
  alert_type    text,
  subject       text,
  since         timestamptz,
  minutes_late  numeric
)
language sql
stable
as $$
  -- 1) Müşteri oturdu, sipariş alınmadı (5 dk üstü, hiç kalem yok ya da hiçbiri gönderilmemiş)
  select 'siparis_alinmadi' as alert_type, rt.name as subject, o.opened_at as since, round(extract(epoch from (now() - o.opened_at)) / 60.0, 1) as minutes_late
  from orders o
  join restaurant_tables rt on rt.id = o.table_id
  where o.restaurant_id = p_restaurant and o.status = 'open'
    and o.opened_at < now() - interval '5 minutes'
    and not exists (select 1 from order_items oi where oi.order_id = o.id and oi.sent_at is not null)

  union all
  -- 2) Yemek hazır, pastada bekliyor (5 dk üstü teslim edilmedi). Sipariş kapanmışsa
  -- (eski/artık ilgisiz veri) bu artık mutfağın sorunu değil — o.status='open' şart.
  select 'hazir_bekliyor', coalesce(rt.name, 'Ayrık hesap') || ' — ' || mi.name, oi.ready_at,
         round(extract(epoch from (now() - oi.ready_at)) / 60.0, 1)
  from order_items oi
  join orders o on o.id = oi.order_id
  left join restaurant_tables rt on rt.id = o.table_id
  join menu_items mi on mi.id = oi.menu_item_id
  where oi.restaurant_id = p_restaurant and o.status = 'open'
    and oi.ready_at is not null and oi.served_at is null
    and oi.ready_at < now() - interval '5 minutes'

  union all
  -- 3) Hesap istendi, kimse gitmedi (5 dk üstü hâlâ bill_requested). "Ne zamandır" bilgisi
  -- rt.updated_at'ten DEĞİL table_status_events'ten alınır — updated_at masa taşınsa/koltuk
  -- sayısı değişse bile yenilenir, bu durumun süresini yanlış gösterirdi.
  select 'hesap_bekliyor', rt.name,
         coalesce((select max(tse.changed_at) from table_status_events tse where tse.table_id = rt.id and tse.to_status = 'bill_requested'), rt.updated_at),
         round(extract(epoch from (now() - coalesce((select max(tse.changed_at) from table_status_events tse where tse.table_id = rt.id and tse.to_status = 'bill_requested'), rt.updated_at))) / 60.0, 1)
  from restaurant_tables rt
  where rt.restaurant_id = p_restaurant and rt.status = 'bill_requested' and rt.deleted_at is null
    and coalesce((select max(tse.changed_at) from table_status_events tse where tse.table_id = rt.id and tse.to_status = 'bill_requested'), rt.updated_at) < now() - interval '5 minutes'

  union all
  -- 4) Kalem kendi pişirme süresini aştı (mutfak ekranındaki "overdue" ile aynı hesap).
  -- o.status='open' şart — kapanmış eski siparişlerin hiç "hazır" işaretlenmemiş kalemleri
  -- (özellikle şemanın ilk günlerinden kalan test verisi) sonsuza dek uyarı üretmesin.
  select 'kalem_suresi_asti', coalesce(rt.name, 'Ayrık hesap') || ' — ' || mi.name, oi.sent_at,
         round(extract(epoch from (now() - oi.sent_at)) / 60.0, 1)
  from order_items oi
  join orders o on o.id = oi.order_id
  left join restaurant_tables rt on rt.id = o.table_id
  join menu_items mi on mi.id = oi.menu_item_id
  where oi.restaurant_id = p_restaurant and o.status = 'open'
    and oi.status in ('active', 'ikram', 'personel')
    and oi.sent_at is not null and oi.ready_at is null
    and oi.sent_at < now() - (coalesce(mi.prep_minutes, 10) || ' minutes')::interval

  union all
  -- 5) Masa toplanmadı (kasa onayladı, 15 dk üstü hâlâ kirli)
  select 'masa_toplanmadi', rt.name, rt.became_toplanacak_at,
         round(extract(epoch from (now() - rt.became_toplanacak_at)) / 60.0, 1)
  from restaurant_tables rt
  where rt.restaurant_id = p_restaurant and rt.status = 'toplanacak' and rt.deleted_at is null
    and rt.became_toplanacak_at < now() - interval '15 minutes'

  union all
  -- 6) Kasa onayı gecikti (garson parayı aldı, 10 dk üstü kasa hâlâ onaylamadı — §O11)
  select 'kasa_onayi_gecikti', coalesce(rt.name, 'Ayrık hesap'), o.payment_collected_at,
         round(extract(epoch from (now() - o.payment_collected_at)) / 60.0, 1)
  from orders o
  left join restaurant_tables rt on rt.id = o.table_id
  where o.restaurant_id = p_restaurant and o.status = 'pending_cashier'
    and o.payment_collected_at < now() - interval '10 minutes'

  order by minutes_late desc;
$$;
