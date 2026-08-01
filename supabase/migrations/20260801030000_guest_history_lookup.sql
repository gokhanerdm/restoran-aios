-- Misafir geçmişi (CRM) — pazar araştırmasında öne çıkan "dönen misafiri tanı" özelliği.
-- Dışarıdan hiçbir sağlayıcıya ihtiyaç yok, elimizdeki veriyle yapılabiliyor (Gökhan: "3'ü de
-- ciddi özellikler ekleyelim"). Telefon numarası formatı (boşluk, +90 vb.) kişiden kişiye
-- değişebildiği için son 10 haneye göre eşleştiriyoruz — düz metin eşleşmesi yerine.
create or replace function guest_history(p_restaurant uuid, p_phone text)
returns table(ziyaret_sayisi bigint, son_not text, son_tarih timestamptz)
language sql
stable
as $$
  select
    count(*)::bigint,
    (array_agg(note order by reserved_at desc) filter (where note is not null and trim(note) <> ''))[1],
    max(reserved_at)
  from reservations
  where restaurant_id = p_restaurant
    and status = 'oturdu'
    and guest_phone is not null
    and length(regexp_replace(p_phone, '\D', '', 'g')) >= 10
    and right(regexp_replace(guest_phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
$$;
