-- Yeni işletme kaydı (ROADMAP L, "işletme beyni" simülasyonu — kayıt/giriş adımı).
-- signUp ile auth.users satırı oluştuktan hemen sonra (e-posta onayı beklenmeden) çağrılır:
-- restaurants + profiles(role='admin') satırlarını atomik olarak açar.
create or replace function bootstrap_restaurant_account(
  p_user_id uuid,
  p_restaurant_name text,
  p_full_name text
)
returns uuid
language plpgsql
as $$
declare
  v_restaurant uuid;
begin
  if exists (select 1 from profiles where id = p_user_id) then
    raise exception 'Bu kullanıcı için zaten bir işletme kaydı var';
  end if;
  if trim(coalesce(p_restaurant_name, '')) = '' then
    raise exception 'İşletme adı boş olamaz';
  end if;

  insert into restaurants (name) values (trim(p_restaurant_name))
  returning id into v_restaurant;

  insert into profiles (id, restaurant_id, full_name, role)
  values (p_user_id, v_restaurant, nullif(trim(p_full_name), ''), 'admin');

  return v_restaurant;
end;
$$;
