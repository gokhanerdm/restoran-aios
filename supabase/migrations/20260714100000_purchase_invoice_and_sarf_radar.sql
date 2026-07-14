-- Fire/Kaçak Radarı Faz 1 (ROADMAP L): çok kalemli fatura girişi + sarf sapma radarı.
-- 1) add_purchase_invoice: bir fatura altında birden çok kalem tek seferde girilir
--    (add_stock_purchase'ın çok satırlı hali; o RPC tek malzemeli hızlı giriş için kalıyor).
-- 2) sarf_usage_radar: peçete örneğindeki "öğrenen oran" mantığı — müşteri başına düşen
--    sarf miktarı geçmişten öğrenilir, son 30 gün bu referanstan belirgin saparsa uyarılır.

create or replace function add_purchase_invoice(
  p_restaurant uuid,
  p_supplier uuid,
  p_invoice_ref text,
  p_purchased_at timestamptz,
  p_items jsonb  -- [{"ingredient_id": uuid, "quantity": num, "unit_price": num}, ...]
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

  return v_purchase;
end;
$$;

-- Sarf sapma radarı. Mantık (Gökhan'ın peçete örneği):
--   referans oran = 30 günden eski toplam alım / 30 günden eski toplam müşteri (öğrenilen taban)
--   güncel oran   = son 30 gün alımı / son 30 gün müşterisi
-- Sarf sayılamadığı için tüketim ölçülemez; uzun vadede "alınan ≈ tüketilen" varsayılır.
-- Durumlar:
--   ogreniyor : taban henüz güvenilir değil (100+ müşteri ve 2+ alış birikmeden yorum yapılmaz)
--   sapma     : güncel oran tabanın %30'undan fazla üstünde (ve son 30 günde 30+ müşteri var)
--   normal    : diğer her şey (son 30 günde hiç alış olmaması da normaldir — stok yetiyordur)
create or replace function sarf_usage_radar(p_restaurant uuid)
returns table (
  ingredient_id uuid,
  ingredient_name text,
  unit text,
  baseline_ratio numeric,
  recent_ratio numeric,
  deviation_percent numeric,
  status text
)
language sql
stable
as $$
  with cust as (
    select
      coalesce(sum(o.party_size) filter (where o.opened_at <  now() - interval '30 days'), 0) as base_cust,
      coalesce(sum(o.party_size) filter (where o.opened_at >= now() - interval '30 days'), 0) as recent_cust
    from orders o
    where o.restaurant_id = p_restaurant
  ),
  buys as (
    select pi.ingredient_id,
      coalesce(sum(pi.quantity) filter (where p.purchased_at <  now() - interval '30 days'), 0) as base_qty,
      count(distinct p.id) filter (where p.purchased_at <  now() - interval '30 days')          as base_purchases,
      coalesce(sum(pi.quantity) filter (where p.purchased_at >= now() - interval '30 days'), 0) as recent_qty
    from purchase_items pi
    join purchases p on p.id = pi.purchase_id and p.deleted_at is null
    where pi.restaurant_id = p_restaurant
    group by pi.ingredient_id
  ),
  calc as (
    select i.id, i.name, i.unit,
      case when c.base_cust   > 0 then b.base_qty   / c.base_cust   end as baseline_ratio,
      case when c.recent_cust > 0 then b.recent_qty / c.recent_cust end as recent_ratio,
      b.base_purchases, c.base_cust, c.recent_cust
    from ingredients i
    join buys b on b.ingredient_id = i.id
    cross join cust c
    where i.restaurant_id = p_restaurant and i.deleted_at is null and i.category = 'sarf'
  )
  select id, name, unit,
    round(baseline_ratio, 3),
    round(recent_ratio, 3),
    case when baseline_ratio > 0 and recent_ratio is not null
         then round((recent_ratio / baseline_ratio - 1) * 100, 1) end,
    case
      when base_cust < 100 or base_purchases < 2 or coalesce(baseline_ratio, 0) = 0 then 'ogreniyor'
      when recent_cust >= 30 and recent_ratio > baseline_ratio * 1.30 then 'sapma'
      else 'normal'
    end
  from calc
  order by name;
$$;
