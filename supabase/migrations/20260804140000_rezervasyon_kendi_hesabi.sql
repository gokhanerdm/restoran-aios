-- Rezervasyon programının kendi hesap/giriş sistemi (Gökhan, 2026-08-04).
-- "AIOS ile işimiz yok" — bu yüzden AIOS'un profiles/bootstrap_restaurant_account
-- mekanizması KULLANILMIYOR, tamamen ayrı bir yol açılıyor: restaurants.owner_user_id
-- doğrudan auth.users'a bakar. İşletme kendi kaydını oluşturur, kendi şifresiyle girer,
-- program oturumdaki kullanıcıya göre kendi restoranını bulur — linkte kod taşımaya
-- gerek kalmaz.
--
-- Tek şubeli / çok şubeli ayrımı: çok şubeli işletme bir marka (companies), markanın
-- altında birden çok şube (restaurants, her biri kendi masalarına/rezervasyonlarına
-- sahip) olarak modelleniyor. Tek şubeli işletmede company_id boş kalır.

create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  business_type text,
  contact_name  text,
  phone         text,
  email         text,
  owner_user_id uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

alter table restaurants add column if not exists owner_user_id uuid references auth.users(id);
alter table restaurants add column if not exists business_type text;
alter table restaurants add column if not exists contact_name text;
alter table restaurants add column if not exists il text;
alter table restaurants add column if not exists ilce text;
alter table restaurants add column if not exists company_id uuid references companies(id);

create index if not exists idx_restaurants_owner_user on restaurants(owner_user_id);

-- Kayıt ekranındaki tek gönderim: tek şubeliyse doğrudan bir restoran, çok şubeliyse
-- önce marka sonra markanın İLK şubesi (ekleme akışı sonraki iş — Gökhan'ın kararı,
-- şimdilik kayıt ekranı sadece ilk şubeyi açar). p_opening_hours, Ayarlar'daki
-- opening_hours ile AYNI biçimde ({"pzt":{"acilis":..,"kapanis":..,"kapali":..}, ...})
-- gelir ki kayıt sonrası Ayarlar'da gün gün düzenlemeye sorunsuz devam edilebilsin.
create or replace function bootstrap_reservation_account(
  p_user_id uuid,
  p_kind text,               -- 'tek' | 'cok'
  p_business_name text,      -- işletme/marka adı (tek şubelide şube adı da bu)
  p_business_type text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_branch_name text,        -- çok şubelide şube adı; tek şubelide kullanılmaz
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
  v_restaurant uuid;
begin
  if exists (select 1 from restaurants where owner_user_id = p_user_id and deleted_at is null) then
    raise exception 'Bu kullanıcı için zaten bir işletme kaydı var';
  end if;
  if trim(coalesce(p_business_name, '')) = '' then
    raise exception 'İşletme adı boş olamaz';
  end if;

  if p_kind = 'cok' then
    insert into companies (name, business_type, contact_name, phone, email, owner_user_id)
    values (trim(p_business_name), nullif(trim(coalesce(p_business_type,'')),''), nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_phone,'')),''), nullif(trim(coalesce(p_email,'')),''), p_user_id)
    returning id into v_company;

    insert into restaurants (name, owner_user_id, business_type, contact_name, phone, il, ilce, address, company_id)
    values (trim(coalesce(nullif(trim(p_branch_name),''), p_business_name)), p_user_id,
            nullif(trim(coalesce(p_business_type,'')),''), nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_branch_phone,'')),''), nullif(trim(coalesce(p_il,'')),''),
            nullif(trim(coalesce(p_ilce,'')),''), nullif(trim(coalesce(p_address,'')),''), v_company)
    returning id into v_restaurant;
  else
    insert into restaurants (name, owner_user_id, business_type, contact_name, phone, il, ilce, address)
    values (trim(p_business_name), p_user_id,
            nullif(trim(coalesce(p_business_type,'')),''), nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_phone,'')),''), nullif(trim(coalesce(p_il,'')),''),
            nullif(trim(coalesce(p_ilce,'')),''), nullif(trim(coalesce(p_address,'')),''))
    returning id into v_restaurant;
  end if;

  insert into restaurant_settings (restaurant_id, opening_hours)
  values (v_restaurant, p_opening_hours);

  return v_restaurant;
end;
$$;

-- Oturumdaki kullanıcının kendi (tek) restoranını bulur — /rezervasyon ve
-- /rezervasyon/ayarlar artık linkteki ?r= koduna değil buna bakacak.
create or replace function my_reservation_restaurant()
returns uuid
language sql
stable
as $$
  select id from restaurants where owner_user_id = auth.uid() and deleted_at is null limit 1;
$$;
