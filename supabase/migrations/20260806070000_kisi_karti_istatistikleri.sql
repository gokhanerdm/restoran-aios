-- Kişi kartı istatistikleri (Gökhan, 2026-08-06: "müşterinin daha önceki hareketlerini bize
-- gösterecek, sadakatini ya da sadakatsizliğini... biz sadece istatistik verelim").
--
-- Düzeltilen hata: "kaç kez geldi" sayısı yalnızca 'oturdu' sayıyordu. Ziyaret bitince kayıt
-- 'tamamlandi'ya geçtiği için gelip giden misafir sayıdan düşüyor, hiç gelmemiş gibi
-- görünüyordu. Artık ziyaret = oturdu + tamamlandi.
--
-- Eklenenler: gelmeme oranı için toplam kayıt, ilk ziyaret, ortalama kişi sayısı, en sık
-- geldiği gün/saat, en çok oturduğu masa, ortalama kalış süresi, ziyaretler arası ortalama
-- sıklık, hangi kanaldan geldiği ve son 5 ziyaretin dökümü (tarih, kişi, masa, o günkü not).
--
-- Dönen sütunlar değiştiği için create or replace yetmiyor, önce düşürmek gerekiyor.
drop function if exists kisi_karti_getir(uuid, text);

create or replace function kisi_karti_getir(p_restaurant uuid, p_phone text)
returns table (
  kart_id uuid,
  isim text,
  kart_notu text,
  ziyaret_sayisi bigint,
  gelmedi_sayisi bigint,
  iptal_sayisi bigint,
  toplam_kayit bigint,
  ilk_ziyaret timestamptz,
  son_ziyaret timestamptz,
  ortalama_kisi numeric,
  en_sik_gun_no int,
  en_sik_saat int,
  en_sik_masa text,
  ortalama_kalis_dk int,
  ortalama_siklik_gun int,
  kanal_dagilimi jsonb,
  son_ziyaretler jsonb,
  baglantilar jsonb
)
language plpgsql
stable
as $$
declare
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_kart_id uuid;
begin
  if length(v_digits) < 10 then
    return;
  end if;

  -- Numara doğrudan bir kartın kendi numarası mı?
  select k.id into v_kart_id
  from kisi_kartlari k
  where k.restaurant_id = p_restaurant
    and right(regexp_replace(k.phone, '\D', '', 'g'), 10) = v_digits
  limit 1;

  -- Değilse, bir karta bağlanmış ikincil numara olabilir.
  if v_kart_id is null then
    select b.kisi_karti_id into v_kart_id
    from kisi_kart_baglantilari b
    join kisi_kartlari k2 on k2.id = b.kisi_karti_id
    where k2.restaurant_id = p_restaurant
      and right(regexp_replace(b.baglanti_telefon, '\D', '', 'g'), 10) = v_digits
    limit 1;
  end if;

  return query
  with numaralar as (
    select v_digits as d
    union
    select right(regexp_replace(k.phone, '\D', '', 'g'), 10) from kisi_kartlari k where k.id = v_kart_id
    union
    select right(regexp_replace(b.baglanti_telefon, '\D', '', 'g'), 10) from kisi_kart_baglantilari b where b.kisi_karti_id = v_kart_id
  ),
  kayitlar as (
    select r.*, (r.reserved_at at time zone 'Europe/Istanbul') as yerel
    from reservations r
    where r.restaurant_id = p_restaurant
      and r.deleted_at is null
      and r.guest_phone is not null
      and right(regexp_replace(r.guest_phone, '\D', '', 'g'), 10) in (select d from numaralar)
  ),
  -- Ziyaret = masaya oturmuş olan. Devam eden (oturdu) ve bitmiş (tamamlandi) ikisi de sayılır.
  ziyaretler as (
    select * from kayitlar where status in ('oturdu', 'tamamlandi')
  )
  select
    v_kart_id,
    (select k.isim from kisi_kartlari k where k.id = v_kart_id),
    (select k.kart_notu from kisi_kartlari k where k.id = v_kart_id),
    (select count(*) from ziyaretler),
    (select count(*) from kayitlar where status = 'gelmedi'),
    (select count(*) from kayitlar where status = 'iptal'),
    (select count(*) from kayitlar),
    (select min(z.reserved_at) from ziyaretler z),
    (select max(z.reserved_at) from ziyaretler z),
    (select round(avg(z.party_size), 1) from ziyaretler z),
    (select extract(dow from z.yerel)::int from ziyaretler z group by 1 order by count(*) desc, 1 limit 1),
    (select extract(hour from z.yerel)::int from ziyaretler z group by 1 order by count(*) desc, 1 limit 1),
    (select t.name from ziyaretler z join restaurant_tables t on t.id = z.table_id group by t.name order by count(*) desc, t.name limit 1),
    (select round(avg(extract(epoch from (z.left_at - z.arrived_at)) / 60))::int
       from ziyaretler z where z.arrived_at is not null and z.left_at is not null),
    -- Ziyaretler arası ortalama gün: ilk ile son arasındaki süre / aradaki boşluk sayısı.
    (select case when count(*) > 1
       then round(extract(epoch from (max(z.reserved_at) - min(z.reserved_at))) / 86400 / (count(*) - 1))::int
     end from ziyaretler z),
    (select coalesce(jsonb_object_agg(s.source, s.adet), '{}'::jsonb)
       from (select k2.source, count(*) as adet from kayitlar k2 group by k2.source) s),
    (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
       select z.reserved_at, z.party_size, z.note, z.status, t.name as masa
       from ziyaretler z
       left join restaurant_tables t on t.id = z.table_id
       order by z.reserved_at desc
       limit 5) x),
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', b2.id, 'telefon', b2.baglanti_telefon, 'aciklama', b2.aciklama) order by b2.created_at)
       from kisi_kart_baglantilari b2 where b2.kisi_karti_id = v_kart_id),
      '[]'::jsonb
    );
end;
$$;
