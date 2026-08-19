-- KAYITTAKİ İŞLETME TÜRÜ AYARLARA BAĞLANDI (Gökhan, 2026-08-16)
--
-- Gökhan: "kayıtta zaten işletme türü seçimi var, biz sadece ayarları ve özellikleri
-- bağlayacağız... sen hepsine bütün ayarları bağla, tek tek düzenleriz."
--
-- Kayıt ekranındaki tür listesi bugüne kadar sadece restaurants.business_type'a yazılıyordu,
-- hiçbir şeyi etkilemiyordu. Artık kayıt anında o türün varsayılanları restaurant_settings'e
-- basılıyor: işletme günü saati, oturma süresi, saate göre masa hesabı, fix menü, minimum
-- harcama, masa paketi, özel gece, PR ve kapı listesi.
--
-- Varsayılanlar TEK YERDE (isletme_tipi_varsayilani) — Ayarlar ekranındaki "bu türün
-- varsayılanlarını uygula" düğmesi de aynı değerleri kullanıyor, ikisi ayrışamaz.

-- Kayıt ekranındaki Türkçe metni slug'a çevirir. Liste büyümeye devam edecek (Gökhan:
-- "eksiklerin arasına yeni nesil meyhaneyi de koyacağız").
create or replace function public.isletme_turu_slug(p_tur text)
returns text
language sql
immutable
as $function$
  select case lower(btrim(coalesce(p_tur, '')))
    when 'gece kulübü'          then 'gece_kulubu'
    when 'bar / pub'            then 'bar_pub'
    when 'meyhane'              then 'meyhane'
    when 'yeni nesil meyhane'   then 'yn_meyhane'
    when 'canlı müzik / gazino' then 'canli_muzik'
    when 'kafe'                 then 'kafe'
    when 'kafeterya'            then 'kafeterya'
    when 'pastane / fırın'      then 'pastane'
    when 'fast food'            then 'fast_food'
    when 'otel restoranı'       then 'otel_restorani'
    when 'restoran'             then 'restoran'
    else 'diger'
  end;
$function$;

-- Bir türün bütün varsayılanları. Ayarlar ekranı da bunu okuyor.
create or replace function public.isletme_tipi_varsayilani(p_tip text)
returns jsonb
language sql
immutable
as $function$
  select case p_tip
    -- Gece sabaha kadar; masa satılır, minimum harcama ve PR çalışır.
    when 'gece_kulubu' then jsonb_build_object(
      'isletme_gunu_saati', '06:00', 'default_duration_minutes', 180, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', true, 'masa_paketi_acik', true,
      'ozel_gece_acik', true, 'pr_acik', true, 'guest_list_acik', true)
    -- Yeni nesil meyhane: eğlence mekânı gibi çalışır ama fix menü de satar.
    when 'yn_meyhane' then jsonb_build_object(
      'isletme_gunu_saati', '04:00', 'default_duration_minutes', 180, 'saate_gore_masa', false,
      'fix_menu_acik', true, 'minimum_harcama_acik', true, 'masa_paketi_acik', true,
      'ozel_gece_acik', true, 'pr_acik', true, 'guest_list_acik', true)
    -- Gecenin sahibi sanatçı; fiyat programa göre değişir.
    when 'canli_muzik' then jsonb_build_object(
      'isletme_gunu_saati', '03:00', 'default_duration_minutes', 180, 'saate_gore_masa', false,
      'fix_menu_acik', true, 'minimum_harcama_acik', true, 'masa_paketi_acik', true,
      'ozel_gece_acik', true, 'pr_acik', false, 'guest_list_acik', false)
    -- Klasik meyhane: masa gece boyu aynı misafirin, genelde fix menü.
    when 'meyhane' then jsonb_build_object(
      'isletme_gunu_saati', '03:00', 'default_duration_minutes', 180, 'saate_gore_masa', false,
      'fix_menu_acik', true, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', true, 'pr_acik', false, 'guest_list_acik', false)
    -- Bar/pub: geç kapanır ama masa satmaz, minimum harcama uygulamaz.
    when 'bar_pub' then jsonb_build_object(
      'isletme_gunu_saati', '04:00', 'default_duration_minutes', 120, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', true, 'pr_acik', false, 'guest_list_acik', false)
    -- Hızlı devir: masa gün içinde birkaç kez döner.
    when 'kafe' then jsonb_build_object(
      'isletme_gunu_saati', '01:00', 'default_duration_minutes', 60, 'saate_gore_masa', true,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false)
    when 'kafeterya' then jsonb_build_object(
      'isletme_gunu_saati', '01:00', 'default_duration_minutes', 60, 'saate_gore_masa', true,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false)
    when 'pastane' then jsonb_build_object(
      'isletme_gunu_saati', '01:00', 'default_duration_minutes', 45, 'saate_gore_masa', true,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false)
    when 'fast_food' then jsonb_build_object(
      'isletme_gunu_saati', '01:00', 'default_duration_minutes', 30, 'saate_gore_masa', true,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false)
    -- Restoran, otel restoranı ve tanımlanmamış türler aynı varsayılanla başlar.
    else jsonb_build_object(
      'isletme_gunu_saati', '01:00', 'default_duration_minutes', 90, 'saate_gore_masa', true,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false)
  end;
$function$;

grant execute on function public.isletme_turu_slug(text) to anon, authenticated;
grant execute on function public.isletme_tipi_varsayilani(text) to anon, authenticated;

-- Kayıt: ayarlar satırı artık türün varsayılanıyla açılıyor.
create or replace function public.bootstrap_reservation_account(
  p_user_id uuid, p_kind text, p_business_name text, p_business_type text, p_contact_name text,
  p_phone text, p_email text, p_branch_name text, p_branch_phone text, p_il text, p_ilce text,
  p_address text, p_opening_hours jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_company uuid;
  v_restaurant uuid;
  v_tip text;
  v_var jsonb;
begin
  if p_user_id is null then
    raise exception 'Kullanıcı kimliği gerekli';
  end if;
  if auth.uid() is not null and p_user_id <> auth.uid() then
    raise exception 'Başka bir kullanıcı adına işletme kaydı açılamaz';
  end if;
  if auth.uid() is null and not exists (
    select 1 from auth.users u where u.id = p_user_id and u.created_at > now() - interval '15 minutes'
  ) then
    raise exception 'Geçersiz kayıt isteği';
  end if;

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

  -- Kayıtta seçilen tür ayarlara bağlanıyor (Gökhan, 2026-08-16).
  v_tip := public.isletme_turu_slug(p_business_type);
  v_var := public.isletme_tipi_varsayilani(v_tip);

  insert into restaurant_settings (
    restaurant_id, opening_hours, isletme_tipi, isletme_gunu_saati, default_duration_minutes,
    saate_gore_masa, fix_menu_acik, minimum_harcama_acik, masa_paketi_acik, ozel_gece_acik,
    pr_acik, guest_list_acik
  )
  values (
    v_restaurant, p_opening_hours, v_tip,
    v_var->>'isletme_gunu_saati', (v_var->>'default_duration_minutes')::int,
    (v_var->>'saate_gore_masa')::boolean, (v_var->>'fix_menu_acik')::boolean,
    (v_var->>'minimum_harcama_acik')::boolean, (v_var->>'masa_paketi_acik')::boolean,
    (v_var->>'ozel_gece_acik')::boolean, (v_var->>'pr_acik')::boolean,
    (v_var->>'guest_list_acik')::boolean
  );

  return v_restaurant;
end;
$function$;

-- Zaten kayıtlı işletmelerin tipi, kayıtta seçtikleri türden dolduruluyor. Ayarlarına
-- DOKUNULMUYOR — sadece tip yazılıyor; varsayılanları basmak işletmenin kararı.
update public.restaurant_settings s
set isletme_tipi = public.isletme_turu_slug(r.business_type)
from public.restaurants r
where r.id = s.restaurant_id and s.isletme_tipi = 'restoran' and r.business_type is not null;
