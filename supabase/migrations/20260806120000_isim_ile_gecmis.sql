-- İSİMLE GEÇMİŞ (Gökhan, 2026-08-06):
-- 1) "Telefon numarası yazılmayan rezervasyonlara kişi kartı açılmıyor, rezervasyon alınan
--    herkese kişi kartı açılacak" — kişi kartı sistemi telefona kilitliydi (kisi_kartlari,
--    kisi_karti_getir). Telefonu olmayan rezervasyonlar için isimle geçmiş çözen bu fonksiyon
--    eklendi; not/numara bağlama gibi telefona bağlı özellikler olmadan salt geçmiş gösterir.
-- 2) "Rezervasyon alınırken daha önce alınan bir rezervasyon bilgisi varsa çıkacak — Hülya
--    Avşar yazarken daha önce o isme rezervasyon varsa çıkacak, kullanıcı ona göre
--    konuşacak" — aynı fonksiyon, isim yazılırken canlı çağrılıyor.
create or replace function isim_ile_gecmis(p_restaurant uuid, p_isim text)
returns table (
  bulunan_telefon text,
  ziyaret_sayisi bigint,
  gelmedi_sayisi bigint,
  iptal_sayisi bigint,
  toplam_kayit bigint,
  son_ziyaret timestamptz,
  ortalama_kisi numeric,
  en_sik_masa text,
  son_kayitlar jsonb
)
language plpgsql
stable
as $$
declare
  v_isim text := lower(trim(coalesce(p_isim, '')));
begin
  if length(v_isim) < 3 then
    return;
  end if;

  return query
  with kayitlar as (
    select r.* from reservations r
    where r.restaurant_id = p_restaurant
      and r.deleted_at is null
      and lower(trim(r.guest_name)) = v_isim
  ),
  -- Ziyaret = masaya oturmuş olan (kisi_karti_getir ile aynı kural).
  ziyaretler as (
    select * from kayitlar where status in ('oturdu', 'tamamlandi')
  )
  select
    (select k.guest_phone from kayitlar k where k.guest_phone is not null order by k.created_at desc limit 1),
    (select count(*) from ziyaretler),
    (select count(*) from kayitlar where status = 'gelmedi'),
    (select count(*) from kayitlar where status = 'iptal'),
    (select count(*) from kayitlar),
    (select max(z.reserved_at) from ziyaretler z),
    (select round(avg(z.party_size), 1) from ziyaretler z),
    (select t.name from ziyaretler z join restaurant_tables t on t.id = z.table_id group by t.name order by count(*) desc, t.name limit 1),
    (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
       select k.reserved_at, k.party_size, k.status, k.guest_phone, k.note
       from kayitlar k
       order by k.reserved_at desc
       limit 5) x);
end;
$$;
