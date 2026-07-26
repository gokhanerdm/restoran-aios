-- Personel günlük özeti — Profil sayfası ve garson/mutfak ekranındaki "kendi durumun" görünümü
-- bu tek fonksiyondan beslenir. Garson: satış + kaç masaya hizmet etti + (ayarlıysa) yüzdelik
-- kıyas. Mutfak/Bar: kaç ürün hazırladı. Toplam ciro ya da başkalarının ham rakamı asla dönmez —
-- sadece kendi rakamı + (izinliyse) göreceli yüzde.
create or replace function staff_daily_summary(p_restaurant_id uuid, p_staff_id uuid)
returns table (
  full_name text,
  role text,
  own_sales numeric,
  own_orders_served bigint,
  own_items_prepared bigint,
  comparison_enabled boolean,
  sales_percent numeric
)
language plpgsql
as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_role text;
  v_name text;
  v_sales numeric := 0;
  v_orders bigint := 0;
  v_items bigint := 0;
  v_total_role_sales numeric := 0;
  v_enabled boolean := false;
begin
  select s.full_name, s.role into v_name, v_role from staff_members s where s.id = p_staff_id;

  select r.staff_comparison_enabled into v_enabled from restaurant_settings r where r.restaurant_id = p_restaurant_id;
  v_enabled := coalesce(v_enabled, false);

  select coalesce(sum(o.total_amount), 0), count(*) into v_sales, v_orders
  from orders o
  where o.restaurant_id = p_restaurant_id and o.closed_by_staff_id = p_staff_id
    and o.status = 'closed' and o.closed_at >= v_day_start;

  select count(*) into v_items
  from order_items oi
  where oi.prepared_by_staff_id = p_staff_id and oi.created_at >= v_day_start;

  if v_enabled and v_role = 'garson' then
    select coalesce(sum(o.total_amount), 0) into v_total_role_sales
    from orders o
    join staff_members sm on sm.id = o.closed_by_staff_id
    where o.restaurant_id = p_restaurant_id and o.status = 'closed' and o.closed_at >= v_day_start
      and sm.role = 'garson';
  end if;

  return query select
    v_name, v_role, v_sales, v_orders, v_items, v_enabled,
    case when v_enabled and v_role = 'garson' and v_total_role_sales > 0
      then round(v_sales / v_total_role_sales * 100, 1)
      else null end;
end;
$$;
