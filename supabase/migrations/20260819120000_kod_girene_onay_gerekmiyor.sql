-- KOD YETERLİ (Gökhan, 2026-08-19: "kodu giren rezervasyon ekranına düşsün direkt").
-- Eskiden kodu giren kişi 'bekliyor' olarak düşüyor, işletme onaylayana kadar hiçbir şey
-- göremiyordu. Artık doğru kodu girmek bağı açıyor: kod işletmenin kendi verdiği anahtar,
-- ikinci bir onay adımı personeli boşuna bekletiyordu.
--
-- KAPATILMIŞ bağ açılmıyor: onu işletme bilerek kapatmış, kod tekrar girilse de geri gelmez.
create or replace function public.personel_kodla_baglan(p_kod text, p_ad text, p_telefon text default null::text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_restoran uuid;
  v_rol text;
  v_mevcut text;
begin
  if auth.uid() is null then
    raise exception 'GIRIS_GEREKLI';
  end if;
  if coalesce(btrim(p_ad), '') = '' then
    raise exception 'AD_GEREKLI';
  end if;

  select k.restaurant_id, k.rol into v_restoran, v_rol
  from public.katilim_kodlari k
  join public.restaurants r on r.id = k.restaurant_id and r.deleted_at is null
  where upper(btrim(k.kod)) = upper(btrim(p_kod));

  -- Eski tek kod hâlâ kabul ediliyor; rolü garson sayılır.
  if v_restoran is null then
    select id, 'garson' into v_restoran, v_rol from public.restaurants
     where upper(btrim(katilim_kodu)) = upper(btrim(p_kod)) and deleted_at is null;
  end if;

  if v_restoran is null then
    raise exception 'KOD_YANLIS';
  end if;

  select durum into v_mevcut from public.personel_hesaplari
   where user_id = auth.uid() and restaurant_id = v_restoran;

  if v_mevcut is not null then
    -- Zaten bağlıysa rolü tazeleniyor; beklemedeyse aynı anda açılıyor.
    update public.personel_hesaplari
       set rol = v_rol,
           durum = case when durum = 'kapali' then durum else 'onayli' end,
           onay_at = case when durum = 'kapali' then onay_at else coalesce(onay_at, now()) end
     where user_id = auth.uid() and restaurant_id = v_restoran;
    select durum into v_mevcut from public.personel_hesaplari
     where user_id = auth.uid() and restaurant_id = v_restoran;
    return v_mevcut;
  end if;

  insert into public.personel_hesaplari (user_id, restaurant_id, ad_soyad, telefon, rol, durum, onay_at)
  values (auth.uid(), v_restoran, btrim(p_ad), nullif(btrim(p_telefon), ''), v_rol, 'onayli', now());
  return 'onayli';
end $function$;
