-- Kişi kartındaki rezervasyon geçmişinde hesap tutarı da görünsün (Gökhan, 2026-08-15:
-- "rezervasyona tamamlandı dedikten sonra rezervasyon satırından girilsin, rezervasyon
-- geçmişinde görünsün"). Tek değişiklik: tum_gecmis satırlarına hesap_tutari eklendi.
create or replace function kisi_karti_getir(p_restaurant uuid, p_phone text, p_kisi_karti_id uuid default null)
returns table (
  kart_id uuid,
  isim text,
  kart_notu text,
  dogum_gunu date,
  vip boolean,
  yemek_tercihi text,
  icki_tercihi text,
  ziyaret_sayisi bigint,
  gelmedi_sayisi bigint,
  iptal_sayisi bigint,
  toplam_kayit bigint,
  ilk_kayit_tarihi timestamptz,
  ilk_ziyaret timestamptz,
  son_ziyaret timestamptz,
  son_rezervasyon_durumu text,
  ortalama_kisi numeric,
  en_sik_gun_no int,
  en_sik_saat int,
  en_sik_masa text,
  ortalama_kalis_dk int,
  ortalama_siklik_gun int,
  kanal_dagilimi jsonb,
  tum_gecmis jsonb,
  baglantilar jsonb
)
language plpgsql
stable
as $$
declare
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_kart_id uuid;
begin
  if p_kisi_karti_id is not null then
    select k.id into v_kart_id from kisi_kartlari k where k.id = p_kisi_karti_id and k.restaurant_id = p_restaurant;
  end if;

  if v_kart_id is null and length(v_digits) >= 10 then
    select k.id into v_kart_id
    from kisi_kartlari k
    where k.restaurant_id = p_restaurant
      and right(regexp_replace(k.phone, '\D', '', 'g'), 10) = v_digits
    limit 1;

    if v_kart_id is null then
      select b.kisi_karti_id into v_kart_id
      from kisi_kart_baglantilari b
      join kisi_kartlari k2 on k2.id = b.kisi_karti_id
      where k2.restaurant_id = p_restaurant
        and right(regexp_replace(b.baglanti_telefon, '\D', '', 'g'), 10) = v_digits
      limit 1;
    end if;
  end if;

  if v_kart_id is null and length(v_digits) < 10 then
    return;
  end if;

  return query
  with numaralar as (
    select v_digits as d where length(v_digits) >= 10
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
      and (
        (v_kart_id is not null and r.kisi_karti_id = v_kart_id)
        or (r.guest_phone is not null and right(regexp_replace(r.guest_phone, '\D', '', 'g'), 10) in (select d from numaralar))
      )
  ),
  ziyaretler as (
    select * from kayitlar where status in ('oturdu', 'tamamlandi')
  )
  select
    v_kart_id,
    (select k.isim from kisi_kartlari k where k.id = v_kart_id),
    (select k.kart_notu from kisi_kartlari k where k.id = v_kart_id),
    (select k.dogum_gunu from kisi_kartlari k where k.id = v_kart_id),
    coalesce((select k.vip from kisi_kartlari k where k.id = v_kart_id), false),
    (select k.yemek_tercihi from kisi_kartlari k where k.id = v_kart_id),
    (select k.icki_tercihi from kisi_kartlari k where k.id = v_kart_id),
    (select count(*) from ziyaretler),
    (select count(*) from kayitlar where status = 'gelmedi'),
    (select count(*) from kayitlar where status = 'iptal'),
    (select count(*) from kayitlar),
    (select min(k.created_at) from kayitlar k),
    (select min(z.reserved_at) from ziyaretler z),
    (select max(z.reserved_at) from ziyaretler z),
    (select k.status from kayitlar k order by k.reserved_at desc limit 1),
    (select round(avg(z.party_size), 1) from ziyaretler z),
    (select extract(dow from z.yerel)::int from ziyaretler z group by 1 order by count(*) desc, 1 limit 1),
    (select extract(hour from z.yerel)::int from ziyaretler z group by 1 order by count(*) desc, 1 limit 1),
    (select t.name from ziyaretler z join restaurant_tables t on t.id = z.table_id group by t.name order by count(*) desc, t.name limit 1),
    (select round(avg(extract(epoch from (z.left_at - z.arrived_at)) / 60))::int
       from ziyaretler z where z.arrived_at is not null and z.left_at is not null),
    (select case when count(*) > 1
       then round(extract(epoch from (max(z.reserved_at) - min(z.reserved_at))) / 86400 / (count(*) - 1))::int
     end from ziyaretler z),
    (select coalesce(jsonb_object_agg(s.source, s.adet), '{}'::jsonb)
       from (select k2.source, count(*) as adet from kayitlar k2 group by k2.source) s),
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.reserved_at desc), '[]'::jsonb) from (
       select k.reserved_at, k.party_size, k.note, k.status, k.cancel_reason, k.hesap_tutari, t.name as masa
       from kayitlar k
       left join restaurant_tables t on t.id = k.table_id
       order by k.reserved_at desc
       limit 30) x),
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', b2.id, 'telefon', b2.baglanti_telefon, 'aciklama', b2.aciklama) order by b2.created_at)
       from kisi_kart_baglantilari b2 where b2.kisi_karti_id = v_kart_id),
      '[]'::jsonb
    );
end;
$$;
