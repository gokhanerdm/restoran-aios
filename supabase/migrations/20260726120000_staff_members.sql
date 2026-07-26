-- Personel kimliği — garson/mutfak/bar cihazlarında PIN ile "kim kullanıyor" belirlemek için.
-- Bilerek profiles'tan (e-posta hesabı gerektiren gerçek Supabase Auth kaydı) AYRI:
-- bu personelin e-postası olmayacak, sadece isim + PIN yeterli (Gökhan kararı, 2026-07-26).
create extension if not exists pgcrypto;

create table staff_members (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  full_name     text not null,
  pin_hash      text not null,
  role          text not null check (role in ('garson', 'mutfak', 'bar', 'kasa', 'sef', 'yonetici')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_staff_members_restaurant on staff_members(restaurant_id);

-- İşletme geneli ayar: garsonlar arası satış yüzdesi kıyası — kişisel bir tercih DEĞİL,
-- yönetici Ayarlar'dan açar/kapatır (Gökhan: "işletme isterse açar istemezse açmaz").
alter table restaurant_settings add column staff_comparison_enabled boolean not null default false;

-- Kim ne yaptı — özet/profil sayfası bu iki alandan beslenecek.
alter table orders add column closed_by_staff_id uuid references staff_members(id);
alter table order_items add column sent_by_staff_id uuid references staff_members(id);
alter table order_items add column prepared_by_staff_id uuid references staff_members(id);

-- PIN girişi doğrulama — anon client pin_hash'i asla görmez, sadece bu fonksiyon üzerinden
-- eşleşen kaydın kimlik bilgilerini (isim/rol) döner.
create or replace function verify_staff_pin(p_restaurant_id uuid, p_pin text)
returns table (id uuid, full_name text, role text)
language sql
security definer
as $$
  select s.id, s.full_name, s.role
  from staff_members s
  where s.restaurant_id = p_restaurant_id
    and s.active
    and s.deleted_at is null
    and s.pin_hash = crypt(p_pin, s.pin_hash)
  limit 1;
$$;

create or replace function add_staff_member(p_restaurant_id uuid, p_full_name text, p_pin text, p_role text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into staff_members (restaurant_id, full_name, pin_hash, role)
  values (p_restaurant_id, p_full_name, crypt(p_pin, gen_salt('bf')), p_role)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function set_staff_pin(p_staff_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
as $$
begin
  update staff_members set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = p_staff_id;
end;
$$;
