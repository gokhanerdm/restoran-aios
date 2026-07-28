-- Personel yemeği/içeceği: stoktan düşer ama SATIŞ DEĞİL, GİDERDİR — ROADMAP §L(E).
--
-- Şartnamedeki uyarı birebir şöyle: "stoktan düşecek ama satış değil gider olarak işlenecek —
-- bu ayrım kritik, aksi halde hem maliyet gizli kalır hem de (A)'daki müşteri başı tüketim
-- oranı bozulur." Bugüne kadar personel yemeği ya hiç girilmiyor (stok sessizce eksiliyor,
-- fire/kaçak radarı bunu kaçak sanıyor) ya da 'ikram' olarak giriliyordu (müşteriye yapılan
-- jestle karışıyor, personel maliyeti görünmez kalıyor).
--
-- 'ikram' ile farkı: ikram MÜŞTERİYE yapılır, pazarlama/telafi giderdir. 'personel' ise
-- ÇALIŞANA gider, personel maliyetinin parçasıdır ve kime gittiği kaydedilir.

alter table order_items drop constraint if exists order_items_status_check;
alter table order_items add constraint order_items_status_check
  check (status in ('active', 'void', 'ikram', 'personel'));

-- Kime gitti. Zorunlu değil (acele serviste boş bırakılabilir) ama girilirse personel
-- bazında gider dökümü çıkar.
alter table order_items add column if not exists staff_meal_for_id uuid references staff_members(id);
create index if not exists idx_order_items_staff_meal on order_items(staff_meal_for_id);

-- Stok düşümü "Hazır" anında oluyor (bkz. mark_item_ready, 2026-07-25 kararı). Personel
-- kalemi de mutfaktan çıktığı için aynı akıştan geçmeli, yoksa stok hiç düşmez.
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
  where id = p_order_item_id
    and status in ('active', 'ikram', 'personel')
    and sent_at is not null and ready_at is null;
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

-- Personel yemeği gideri — kişi bazında adet ve REÇETE MALİYETİ.
-- Menü fiyatı bilgi amaçlı döner; gerçek gider maliyet tarafıdır (menü fiyatı üzerinden
-- gider yazmak işletmeye olmayan bir kâr kaybı yazar).
create or replace function staff_meal_cost(p_restaurant uuid, p_from timestamptz, p_to timestamptz)
returns table (
  staff_id     uuid,
  full_name    text,
  adet         bigint,
  menu_tutari  numeric,
  maliyet      numeric
)
language sql
stable
as $$
  with kalem as (
    select oi.staff_meal_for_id as sid,
           oi.quantity,
           oi.quantity * oi.unit_price as menu_tutar,
           oi.quantity * coalesce((
             select sum(ri.quantity * i.current_unit_cost)
             from recipe_items ri
             join ingredients i on i.id = ri.ingredient_id
             where ri.menu_item_id = oi.menu_item_id
           ), 0) as maliyet
    from order_items oi
    where oi.restaurant_id = p_restaurant
      and oi.status = 'personel'
      and coalesce(oi.ready_at, oi.sent_at, oi.created_at) >= p_from
      and coalesce(oi.ready_at, oi.sent_at, oi.created_at) < p_to
  )
  select k.sid,
         coalesce(sm.full_name, 'Kime gittiği girilmemiş'),
         sum(k.quantity)::bigint,
         round(sum(k.menu_tutar), 2),
         round(sum(k.maliyet), 2)
  from kalem k
  left join staff_members sm on sm.id = k.sid
  group by k.sid, sm.full_name
  order by 5 desc;
$$;
