-- İSİM SOYAD İLE ARA (Gökhan, 2026-08-07): "isim yazıyorum, soyadı yazmaya geçtiğimde
-- tanımaya başlayacak — isim TAM, soyadı BAŞLANGIÇ eşleşen kişileri listeleyecek, aynı isimde
-- 2 kişi varsa telefon numaralarıyla ayırt edilecek." İsimden tek başına arama YOK — çağıran
-- taraf (frontend) soyad kısmı boşsa bu fonksiyonu hiç çağırmıyor.
--
-- Telefon numarası olmayan rezervasyonlar bu aramaya girmez (kimin kim olduğu belirsiz kalır,
-- o senaryo hâlâ isim_ile_gecmis'in bilgi kutusuyla karşılanıyor). Aynı telefon numarasına ait
-- birden fazla kayıt varsa (kişi defalarca gelmiş) TEK aday olarak, en son yazdığı isimle
-- listelenir — telefon numarası gerçek kimlik anahtarı.
create or replace function isim_soyad_ile_ara(p_restaurant uuid, p_isim text, p_soyad_prefix text)
returns table (
  kisi_karti_id uuid,
  guest_name text,
  guest_phone text,
  son_gorulen timestamptz
)
language sql
stable
as $$
  with eslesen as (
    select
      r.guest_name, r.guest_phone, r.reserved_at, r.kisi_karti_id,
      right(regexp_replace(r.guest_phone, '\D', '', 'g'), 10) as digits
    from reservations r
    where r.restaurant_id = p_restaurant
      and r.deleted_at is null
      and r.guest_phone is not null
      and length(regexp_replace(r.guest_phone, '\D', '', 'g')) >= 10
      and lower(split_part(trim(r.guest_name), ' ', 1)) = lower(trim(p_isim))
      and lower(trim(substring(trim(r.guest_name) from length(split_part(trim(r.guest_name), ' ', 1)) + 1)))
          like lower(trim(p_soyad_prefix)) || '%'
  ),
  gruplu as (
    select
      digits,
      (array_agg(guest_name order by reserved_at desc))[1] as guest_name,
      (array_agg(guest_phone order by reserved_at desc))[1] as guest_phone,
      (array_agg(kisi_karti_id order by reserved_at desc) filter (where kisi_karti_id is not null))[1] as kisi_karti_id_rez,
      max(reserved_at) as son_gorulen
    from eslesen
    group by digits
  )
  select coalesce(g.kisi_karti_id_rez, k.id), g.guest_name, g.guest_phone, g.son_gorulen
  from gruplu g
  left join kisi_kartlari k
    on k.restaurant_id = p_restaurant
    and right(regexp_replace(k.phone, '\D', '', 'g'), 10) = g.digits
  order by g.son_gorulen desc
  limit 8;
$$;
