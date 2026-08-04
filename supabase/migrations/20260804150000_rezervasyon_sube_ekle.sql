-- Çok şubeli hesapta "Şube ekle" (Gökhan, 2026-08-04): "girilen bilgiler aynı olmalı,
-- şube ekle dediğinde de değişkenlik gösteren bilgiler girilmeli". Marka bilgisi
-- (işletme türü, yetkili adı) kayıt sırasında AÇILAN company satırından kopyalanır,
-- kullanıcıya tekrar sorulmaz — sadece şubeye özgü alanlar (ad, telefon, il, ilçe,
-- adres, çalışma saatleri) istenir.
create or replace function add_reservation_branch(
  p_user_id uuid,
  p_branch_name text,
  p_branch_phone text,
  p_il text,
  p_ilce text,
  p_address text,
  p_opening_hours jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_company uuid;
  v_business_type text;
  v_contact_name text;
  v_restaurant uuid;
begin
  select c.id, c.business_type, c.contact_name
  into v_company, v_business_type, v_contact_name
  from companies c
  where c.owner_user_id = p_user_id and c.deleted_at is null
  order by c.created_at
  limit 1;

  if v_company is null then
    raise exception 'Bu hesapta çok şubeli bir marka kaydı yok';
  end if;
  if trim(coalesce(p_branch_name, '')) = '' then
    raise exception 'Şube adı boş olamaz';
  end if;

  insert into restaurants (name, owner_user_id, business_type, contact_name, phone, il, ilce, address, company_id)
  values (
    trim(p_branch_name), p_user_id, v_business_type, v_contact_name,
    nullif(trim(coalesce(p_branch_phone, '')), ''), nullif(trim(coalesce(p_il, '')), ''),
    nullif(trim(coalesce(p_ilce, '')), ''), nullif(trim(coalesce(p_address, '')), ''), v_company
  )
  returning id into v_restaurant;

  insert into restaurant_settings (restaurant_id, opening_hours) values (v_restaurant, p_opening_hours);

  return v_restaurant;
end;
$$;
