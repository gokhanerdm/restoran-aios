-- İSTATİSTİKLER > Kanallar (Gökhan, 2026-08-07): iletisim_kanali bazlı kırılım.
create or replace function istatistik_kanal(p_restaurant uuid, p_baslangic timestamptz, p_bitis timestamptz)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kanal', coalesce(k.iletisim_kanali, 'telefon'),
    'rezervasyon', k.rezervasyon, 'misafir', k.misafir,
    'geldi', k.geldi, 'iptal', k.iptal, 'gelmedi', k.gelmedi,
    'gerceklesen_orani', case when k.rezervasyon > 0 then round(k.geldi::numeric / k.rezervasyon * 100, 1) else null end
  ) order by k.rezervasyon desc), '[]'::jsonb)
  from (
    select iletisim_kanali, count(*) as rezervasyon, sum(party_size) as misafir,
      count(*) filter (where status in ('geldi', 'oturdu', 'tamamlandi')) as geldi,
      count(*) filter (where status = 'iptal') as iptal,
      count(*) filter (where status = 'gelmedi') as gelmedi
    from reservations
    where restaurant_id = p_restaurant and deleted_at is null
      and reserved_at >= p_baslangic and reserved_at < p_bitis
    group by iletisim_kanali
  ) k;
$$;
