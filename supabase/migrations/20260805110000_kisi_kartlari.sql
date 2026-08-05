-- Kişi Kartı (Gökhan, 2026-08-05: "sistem müşteriyi tanıyacak... kişi kartında beraber
-- geldikleri gibi bir seçenek olacak"). Telefon numarası başına bir kart; bir kişi farklı
-- numaralarla geldiyse o numaralar bu kartın altına elle bağlanır (garson bağlar, otomatik
-- isim eşleşmesi yapılmıyor — "bilgi yoksa tanıma yok").
create table kisi_kartlari (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  phone         text not null,
  isim          text,
  kart_notu     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, phone)
);
create index idx_kisi_kartlari_restaurant on kisi_kartlari(restaurant_id);

-- Bir karta bağlı ikincil numaralar — "birlikte geldiler" gibi bir açıklamayla.
create table kisi_kart_baglantilari (
  id              uuid primary key default gen_random_uuid(),
  kisi_karti_id   uuid not null references kisi_kartlari(id) on delete cascade,
  baglanti_telefon text not null,
  aciklama        text,
  created_at      timestamptz not null default now()
);
create index idx_kisi_kart_baglantilari_kart on kisi_kart_baglantilari(kisi_karti_id);

-- Bir telefonu kartına ve geçmişine (oturdu/gelmedi/iptal sayıları, bağlı numaralar) çözer.
-- Kart yoksa bile o numaranın kendi geçmişini döner (guest_history'nin yerine geçiyor).
create or replace function kisi_karti_getir(p_restaurant uuid, p_phone text)
returns table (
  kart_id uuid,
  isim text,
  kart_notu text,
  ziyaret_sayisi bigint,
  gelmedi_sayisi bigint,
  iptal_sayisi bigint,
  son_ziyaret timestamptz,
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

  return query
  select
    v_kart_id,
    k.isim,
    k.kart_notu,
    count(*) filter (where r.status = 'oturdu')::bigint,
    count(*) filter (where r.status = 'gelmedi')::bigint,
    count(*) filter (where r.status = 'iptal')::bigint,
    max(r.reserved_at) filter (where r.status = 'oturdu'),
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', b2.id, 'telefon', b2.baglanti_telefon, 'aciklama', b2.aciklama) order by b2.created_at)
       from kisi_kart_baglantilari b2 where b2.kisi_karti_id = v_kart_id),
      '[]'::jsonb
    )
  from reservations r
  left join kisi_kartlari k on k.id = v_kart_id
  where r.restaurant_id = p_restaurant
    and r.guest_phone is not null
    and right(regexp_replace(r.guest_phone, '\D', '', 'g'), 10) in (
      select right(regexp_replace(phone, '\D', '', 'g'), 10) from kisi_kartlari where id = v_kart_id
      union all
      select right(regexp_replace(baglanti_telefon, '\D', '', 'g'), 10) from kisi_kart_baglantilari where kisi_karti_id = v_kart_id
      union all
      select v_digits
    )
  group by k.isim, k.kart_notu;
end;
$$;
