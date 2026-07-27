-- Satın alma planlaması — fire/kaçak radarının bir sonraki adımı (Gökhan, 2026-07-27).
-- Üç parça: 1) stok düşme artık hesap kapanınca değil mutfaktan "hazır" denince olur,
-- 2) kritik seviye + tedarik periyoduna göre otomatik sipariş önerisi (canlı hesaplanır,
-- kaydedilmez — bir insan onaylayana kadar veritabanında hiçbir iz bırakmaz),
-- 3) onay -> sipariş -> (fatura girilince) karşılandı akışı, zaten var olan ama hiç
-- kullanılmayan purchase_requests tablosu üzerinden.

-- ============================================================
-- 1) STOK DÜŞME: hesap kapanışından mutfaktan "hazır" anına taşınıyor
-- ============================================================

-- close_order artık stok düşmüyor — bunu mark_item_ready üstleniyor. Diğer her şey
-- (toplam hesaplama, indirim, masa boşaltma) aynen kalıyor.
create or replace function close_order(p_order_id uuid, p_staff_id uuid default null)
returns void
language plpgsql
as $function$
declare
  v_total numeric(12,2);
  v_discounts numeric(12,2);
  v_table uuid;
begin
  select table_id into v_table
  from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_total
  from order_items where order_id = p_order_id and status = 'active';

  select coalesce(sum(amount), 0) into v_discounts
  from order_discounts where order_id = p_order_id;
  v_total := greatest(0, v_total - v_discounts);

  update orders set status = 'closed', closed_at = now(), total_amount = v_total, updated_at = now(),
    closed_by_staff_id = p_staff_id
  where id = p_order_id;

  if v_table is not null then
    update restaurant_tables set status = 'empty', updated_at = now() where id = v_table;
  end if;
end;
$function$;

-- Mutfak/bar bir kalemi "hazır" işaretlediğinde çağrılır. Atomik: aynı kalem için iki kez
-- çağrılırsa (çift tıklama, iki cihaz) ikinci çağrı GET DIAGNOSTICS ile 0 satır güncellendiğini
-- görüp stok hareketi YAZMAZ — çift düşüm riski yok. WHERE ready_at is null bunu garanti eder.
create or replace function mark_item_ready(p_order_item_id uuid, p_staff_id uuid default null)
returns void
language plpgsql
as $function$
declare
  v_rest uuid;
  v_menu_item uuid;
  v_qty int;
  v_updated int;
begin
  select restaurant_id, menu_item_id, quantity into v_rest, v_menu_item, v_qty
  from order_items
  where id = p_order_item_id and status in ('active', 'ikram') and sent_at is not null and ready_at is null;
  if not found then
    return; -- zaten hazır işaretlenmiş ya da uygun durumda değil — sessizce çık, hata verme
  end if;

  update order_items set ready_at = now(), prepared_by_staff_id = p_staff_id
  where id = p_order_item_id and ready_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return; -- yarış durumu: araya başka bir çağrı girdi, o zaten düşürdü
  end if;

  insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id)
  select v_rest, ri.ingredient_id, 'consumption',
         -(ri.quantity * v_qty), i.current_unit_cost, 'order', p_order_item_id
  from recipe_items ri
  join ingredients i on i.id = ri.ingredient_id
  where ri.menu_item_id = v_menu_item;
end;
$function$;

-- ============================================================
-- 2) ONAY ROLÜ AYARI
-- ============================================================
-- "İşletme karar verecek" (Gökhan) — hangi rol(ler) satın alma önerisini onaylayabilir.
-- Not: Stok sayfası şu an PIN'li personel oturumuna değil, gerçek (Supabase auth) girişe
-- bağlı; yani bu ayar şimdilik fiilen uygulanmıyor, ileride PIN'li bir ekrana taşınırsa
-- devreye girecek. Varsayılan: yönetici.
alter table restaurant_settings add column purchase_approval_roles text[] not null default '{yonetici}';

-- ============================================================
-- 3) PURCHASE_REQUESTS — onay/sipariş/karşılama akışı
-- ============================================================
alter table purchase_requests drop constraint purchase_requests_status_check;
alter table purchase_requests add constraint purchase_requests_status_check
  check (status in ('bekliyor', 'onaylandi', 'siparis_verildi', 'reddedildi', 'karsilandi'));

-- approved_by (profiles) mevcut haliyle kalıyor ama şimdilik hiç yazılmıyor — Stok sayfasında
-- personel PIN kimliği yok. approved_by_staff_id, PIN'li bir ekrandan onay gelirse doldurulur.
alter table purchase_requests add column approved_by_staff_id uuid references staff_members(id);
-- Karşılandığında hangi fatura/alımla kapandığını gösterir.
alter table purchase_requests add column purchase_id uuid references purchases(id);
-- Önerinin hangi süreye göre hesaplandığı (kaç günlük sarfiyat + %10) — ekranda gösterim için.
alter table purchase_requests add column target_days int;

-- ============================================================
-- 4) CANLI ÖNERİ LİSTESİ
-- ============================================================
-- Hiçbir şey KAYDETMEZ — her çağrıldığında güncel stok/sarfiyat/tedarik takvimine göre
-- yeniden hesaplar ("her satışta kendini yenileyen liste" böyle sağlanıyor: veri tabanında
-- bayatlayacak bir kopya tutmak yerine, ihtiyaç olduğunda taze hesaplanıyor — ingredient_
-- expected_usage ve sarf_usage_radar RPC'leriyle aynı mimari).
--
-- Tetik: mevcut stok par_level'in altında VE malzemenin bir tedarikçisi var.
-- Miktar: (28 günlük ortalama günlük tüketim) x (bir sonraki teslimata kalan gün) x 1.10,
--         mevcut stok düşülerek. Bir sonraki teslimat: tedarikçinin delivery_days dizisindeki
--         BUGÜNDEN SONRAKİ en yakın gün (bugün teslimat günüyse bile, "şimdi verilen sipariş
--         bugünün sevkiyatını yakalayamaz" varsayımıyla bir sonraki haftaya bakılır).
--         delivery_days boşsa 7 gün (haftalık) varsayılır.
-- Bastırma: aynı malzeme için zaten işlemde olan (onaylandi/siparis_verildi) bir talep varsa,
--           ya da 2 gün içinde reddedilmişse tekrar önerilmez.
create or replace function suggested_purchase_list(p_restaurant uuid)
returns table (
  ingredient_id uuid,
  ingredient_name text,
  unit text,
  current_stock numeric,
  par_level numeric,
  avg_daily_usage numeric,
  days_until_delivery int,
  suggested_qty numeric,
  supplier_id uuid,
  supplier_name text,
  current_unit_cost numeric,
  estimated_cost numeric
)
language sql
stable
as $$
  with today as (
    select extract(isodow from now() at time zone 'Europe/Istanbul')::int as dow
  ),
  stock_now as (
    select sm.ingredient_id, sum(sm.quantity) as qty
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
    group by sm.ingredient_id
  ),
  usage_28d as (
    select sm.ingredient_id, sum(-sm.quantity) / 28.0 as avg_daily
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
      and sm.movement_type in ('consumption', 'waste')
      and sm.occurred_at >= now() - interval '28 days'
    group by sm.ingredient_id
  ),
  islemde as (
    -- Zaten işlemde olan ya da yakın zamanda reddedilen talepler — tekrar önerilmesin.
    select ingredient_id from purchase_requests
    where restaurant_id = p_restaurant
      and (status in ('bekliyor', 'onaylandi', 'siparis_verildi')
        or (status = 'reddedildi' and created_at >= now() - interval '2 days'))
  )
  select
    i.id, i.name, i.unit,
    coalesce(sn.qty, 0) as current_stock,
    i.par_level,
    coalesce(u.avg_daily, 0) as avg_daily_usage,
    coalesce((
      select min(case when d > t.dow then d - t.dow else d - t.dow + 7 end)
      from unnest(s.delivery_days) as d, today t
    ), 7) as days_until_delivery,
    greatest(0, round(
      coalesce(u.avg_daily, 0)
      * coalesce((
          select min(case when d > t.dow then d - t.dow else d - t.dow + 7 end)
          from unnest(s.delivery_days) as d, today t
        ), 7)
      * 1.10
      - coalesce(sn.qty, 0)
    , 2)) as suggested_qty,
    i.supplier_id, s.name,
    i.current_unit_cost,
    round(greatest(0,
      coalesce(u.avg_daily, 0)
      * coalesce((
          select min(case when d > t.dow then d - t.dow else d - t.dow + 7 end)
          from unnest(s.delivery_days) as d, today t
        ), 7)
      * 1.10
      - coalesce(sn.qty, 0)
    ) * i.current_unit_cost, 2) as estimated_cost
  from ingredients i
  join suppliers s on s.id = i.supplier_id and s.deleted_at is null
  left join stock_now sn on sn.ingredient_id = i.id
  left join usage_28d u on u.ingredient_id = i.id
  where i.restaurant_id = p_restaurant and i.deleted_at is null
    and i.par_level > 0
    and coalesce(sn.qty, 0) <= i.par_level
    and i.id not in (select ingredient_id from islemde)
  order by (coalesce(sn.qty, 0) / nullif(i.par_level, 0)) asc;
$$;

-- Bir öneriyi onaylamak — canlı hesaplanan öneriyi kalıcı bir karara dönüştürür.
create or replace function approve_purchase_request(
  p_restaurant uuid, p_ingredient_id uuid, p_supplier_id uuid,
  p_quantity numeric, p_days int, p_staff_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into purchase_requests (restaurant_id, ingredient_id, supplier_id, suggested_qty, target_days, reason, status, approved_by_staff_id, approved_at)
  values (p_restaurant, p_ingredient_id, p_supplier_id, p_quantity, p_days,
          p_days || ' günlük sarfiyat + %10 pay ile önerildi', 'onaylandi', p_staff_id, now())
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================
-- 5) FATURA GİRİŞİ -> BEKLEYEN TALEBİ KAPATIR
-- ============================================================
-- Mevcut fatura giriş ekranı (Stok sayfası) hem gerçek "manuel giriş" hem de simüle
-- e-fatura girişi olarak kullanılacak (Gökhan: "e fatura gelmeden program kapatamadığı
-- için manuel girişle kapanacak" — ikisi aynı mekanizma). p_purchase_request_id verilirse
-- o talebi karşılandı olarak kapatır; verilmezse (bağımsız bir alım) eskisi gibi çalışır.
create or replace function add_purchase_invoice(
  p_restaurant uuid,
  p_supplier uuid,
  p_invoice_ref text,
  p_purchased_at timestamptz,
  p_items jsonb,
  p_purchase_request_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_purchase uuid;
  v_when timestamptz := coalesce(p_purchased_at, now());
  v_total numeric := 0;
  it jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Fatura en az bir kalem içermeli';
  end if;

  select sum((x->>'quantity')::numeric * (x->>'unit_price')::numeric)
  into v_total from jsonb_array_elements(p_items) x;

  insert into purchases (restaurant_id, supplier_id, purchased_at, total_amount, source, invoice_ref)
  values (p_restaurant, p_supplier, v_when, coalesce(v_total, 0), 'manuel', nullif(trim(p_invoice_ref), ''))
  returning id into v_purchase;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into purchase_items (restaurant_id, purchase_id, ingredient_id, quantity, unit_price)
    values (p_restaurant, v_purchase, (it->>'ingredient_id')::uuid,
            (it->>'quantity')::numeric, (it->>'unit_price')::numeric);

    insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id, occurred_at)
    values (p_restaurant, (it->>'ingredient_id')::uuid, 'purchase',
            (it->>'quantity')::numeric, (it->>'unit_price')::numeric, 'purchase', v_purchase, v_when);

    update ingredients set current_unit_cost = (it->>'unit_price')::numeric, updated_at = now()
    where id = (it->>'ingredient_id')::uuid;
  end loop;

  if p_purchase_request_id is not null then
    update purchase_requests
    set status = 'karsilandi', purchase_id = v_purchase
    where id = p_purchase_request_id and restaurant_id = p_restaurant;
  end if;

  return v_purchase;
end;
$$;
