-- KAYITTA GİRİLEN E-POSTA İŞLETME BİLGİLERİNE YAZILSIN (Gökhan, 2026-08-19: "kayıtta mail
-- girilmesine rağmen ayarlar işletme bilgisine işlenmemiş").
--
-- Kayıt ekranı e-postayı zaten gönderiyordu (p_email) ama bu değer sadece ÇOK ŞUBELİ kayıtta
-- companies.email'e yazılıyordu; restaurants.eposta hiçbir yolda doldurulmuyordu. Ayarlar >
-- İşletme bilgileri o alanı restaurants.eposta'dan okuduğu için kutu boş açılıyordu.
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
  v_saatler jsonb;
  v_gun text;
  v_eposta text;
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

  -- E-posta hep küçük harfe indiriliyor — Ayarlar'daki kutu da kaydederken aynısını yapıyor,
  -- iki yol aynı değeri yazsın.
  v_eposta := nullif(lower(trim(coalesce(p_email, ''))), '');

  if p_kind = 'cok' then
    insert into companies (name, business_type, contact_name, phone, email, owner_user_id)
    values (trim(p_business_name), nullif(trim(coalesce(p_business_type,'')),''), nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_phone,'')),''), v_eposta, p_user_id)
    returning id into v_company;

    insert into restaurants (name, owner_user_id, business_type, contact_name, phone, eposta, il, ilce, address, company_id)
    values (trim(coalesce(nullif(trim(p_branch_name),''), p_business_name)), p_user_id,
            nullif(trim(coalesce(p_business_type,'')),''), nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_branch_phone,'')),''), v_eposta, nullif(trim(coalesce(p_il,'')),''),
            nullif(trim(coalesce(p_ilce,'')),''), nullif(trim(coalesce(p_address,'')),''), v_company)
    returning id into v_restaurant;
  else
    insert into restaurants (name, owner_user_id, business_type, contact_name, phone, eposta, il, ilce, address)
    values (trim(p_business_name), p_user_id,
            nullif(trim(coalesce(p_business_type,'')),''), nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_phone,'')),''), v_eposta, nullif(trim(coalesce(p_il,'')),''),
            nullif(trim(coalesce(p_ilce,'')),''), nullif(trim(coalesce(p_address,'')),''))
    returning id into v_restaurant;
  end if;

  v_tip := public.isletme_turu_slug(p_business_type);
  v_var := public.isletme_tipi_varsayilani(v_tip);

  -- Kayıt ekranından gelen açık/kapalı bilgisini koru, saatleri türden yaz.
  v_saatler := coalesce(p_opening_hours, '{}'::jsonb);
  foreach v_gun in array array['pzt','sal','car','per','cum','cmt','paz'] loop
    v_saatler := jsonb_set(v_saatler, array[v_gun], jsonb_build_object(
      'acilis', v_var->>'acilis',
      'kapanis', v_var->>'kapanis',
      'kapali', coalesce((v_saatler->v_gun->>'kapali')::boolean, false)
    ), true);
  end loop;

  insert into restaurant_settings (
    restaurant_id, opening_hours, isletme_tipi, isletme_gunu_saati, default_duration_minutes,
    saate_gore_masa, fix_menu_acik, minimum_harcama_acik, masa_paketi_acik, ozel_gece_acik,
    pr_acik, guest_list_acik
  )
  values (
    v_restaurant, v_saatler, v_tip,
    v_var->>'isletme_gunu_saati', (v_var->>'default_duration_minutes')::int,
    false, (v_var->>'fix_menu_acik')::boolean,
    (v_var->>'minimum_harcama_acik')::boolean, (v_var->>'masa_paketi_acik')::boolean,
    (v_var->>'ozel_gece_acik')::boolean, (v_var->>'pr_acik')::boolean,
    (v_var->>'guest_list_acik')::boolean
  );

  return v_restaurant;
end;
$function$;

-- Şimdiye kadar açılmış işletmelerde alan boş kaldı; sahibinin giriş e-postasıyla doldurulur.
-- Elle bir e-posta girilmişse ona DOKUNULMUYOR.
update public.restaurants r
set eposta = lower(u.email)
from auth.users u
where u.id = r.owner_user_id and r.deleted_at is null and r.eposta is null and u.email is not null;
