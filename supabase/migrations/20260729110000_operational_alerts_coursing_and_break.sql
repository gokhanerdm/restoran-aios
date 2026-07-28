-- Şef aksaklık paneli — ROADMAP §O9, eskiden altyapısı olmadığı için ertelenen 2 madde.
-- Faz 9 (servis sırası) ve Faz 6 (garson ataması/mola) ile altyapı artık var — ekleniyor.
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
  select 'siparis_alinmadi' as alert_type, rt.name as subject, o.opened_at as since, round(extract(epoch from (now() - o.opened_at)) / 60.0, 1) as minutes_late
  from orders o
  join restaurant_tables rt on rt.id = o.table_id
  where o.restaurant_id = p_restaurant and o.status = 'open'
    and o.opened_at < now() - interval '5 minutes'
    and not exists (select 1 from order_items oi where oi.order_id = o.id and oi.sent_at is not null)

  union all
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
  select 'hesap_bekliyor', rt.name,
         coalesce((select max(tse.changed_at) from table_status_events tse where tse.table_id = rt.id and tse.to_status = 'bill_requested'), rt.updated_at),
         round(extract(epoch from (now() - coalesce((select max(tse.changed_at) from table_status_events tse where tse.table_id = rt.id and tse.to_status = 'bill_requested'), rt.updated_at))) / 60.0, 1)
  from restaurant_tables rt
  where rt.restaurant_id = p_restaurant and rt.status = 'bill_requested' and rt.deleted_at is null
    and coalesce((select max(tse.changed_at) from table_status_events tse where tse.table_id = rt.id and tse.to_status = 'bill_requested'), rt.updated_at) < now() - interval '5 minutes'

  union all
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
  select 'masa_toplanmadi', rt.name, rt.became_toplanacak_at,
         round(extract(epoch from (now() - rt.became_toplanacak_at)) / 60.0, 1)
  from restaurant_tables rt
  where rt.restaurant_id = p_restaurant and rt.status = 'toplanacak' and rt.deleted_at is null
    and rt.became_toplanacak_at < now() - interval '15 minutes'

  union all
  select 'kasa_onayi_gecikti', coalesce(rt.name, 'Ayrık hesap'), o.payment_collected_at,
         round(extract(epoch from (now() - o.payment_collected_at)) / 60.0, 1)
  from orders o
  left join restaurant_tables rt on rt.id = o.table_id
  where o.restaurant_id = p_restaurant and o.status = 'pending_cashier'
    and o.payment_collected_at < now() - interval '10 minutes'

  union all
  -- 7) Başlangıç (course 1) teslim edildi, sonraki servis (course_no>=2) hâlâ garson
  -- tarafından serbest bırakılmadı (15 dk üstü) — servis sırası açık restoranlarda garson unutmuş olabilir.
  select 'baslangic_bekletiliyor', coalesce(rt.name, 'Ayrık hesap'), course1_done.done_at,
         round(extract(epoch from (now() - course1_done.done_at)) / 60.0, 1)
  from orders o
  left join restaurant_tables rt on rt.id = o.table_id
  join lateral (
    select max(oi1.served_at) as done_at
    from order_items oi1
    where oi1.order_id = o.id and oi1.course_no = 1
    having count(*) > 0 and count(*) filter (where oi1.served_at is null) = 0
  ) course1_done on true
  where o.restaurant_id = p_restaurant and o.status = 'open'
    and course1_done.done_at < now() - interval '15 minutes'
    and exists (
      select 1 from order_items oi2
      where oi2.order_id = o.id and oi2.course_no >= 2 and oi2.status = 'active' and oi2.sent_at is null
    )

  union all
  -- 8) Garson molada, üzerine atanmış dolu masalar var — "herkese açık" sayılsa da şefin
  -- haberi olsun (ROADMAP §O3/§O9). Masa başına değil garson başına tek satır: kaç masa bekliyor.
  select 'garson_molada_masa_var', sm.full_name || ' — ' || count(*) || ' masa', sm.break_started_at,
         round(extract(epoch from (now() - sm.break_started_at)) / 60.0, 1)
  from restaurant_tables rt
  join staff_members sm on sm.id = rt.assigned_staff_id
  where rt.restaurant_id = p_restaurant and rt.deleted_at is null
    and rt.status = 'occupied' and sm.on_break = true
    and sm.break_started_at < now() - interval '10 minutes'
  group by sm.id, sm.full_name, sm.break_started_at

  order by minutes_late desc;
$$;
