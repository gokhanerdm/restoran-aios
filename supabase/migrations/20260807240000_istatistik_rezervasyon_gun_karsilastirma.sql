-- İSTATİSTİKLER > Rezervasyonlar sekmesi > gün karşılaştırma tablosu: seçilen haftanın
-- günlerine göre (Gökhan: "cuma cumartesiyi seçip ikisini de değerlendirebilsin") son 10
-- günün Rezervasyonlar/Geldi/Gelmedi/İptal/Bekleyen sayılarını yan yana verir. Hangi 10 gün
-- olduğunu (seçili haftanın günlerine göre) frontend hesaplar, buraya hazır tarih listesi
-- gelir. Gökhan, 2026-08-07.
create or replace function istatistik_rezervasyon_gun_karsilastirma(p_restaurant uuid, p_gunler date[])
returns table (gun date, toplam bigint, geldi bigint, gelmedi bigint, iptal bigint, bekleyen bigint)
language sql
stable
as $$
  with gunler as (
    select unnest(p_gunler) as gun
  ),
  taban as (
    select r.status, (r.reserved_at at time zone 'Europe/Istanbul')::date as gun_r
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
  )
  select
    g.gun,
    count(*) filter (where t.gun_r = g.gun) as toplam,
    count(*) filter (where t.gun_r = g.gun and t.status in ('geldi', 'oturdu', 'tamamlandi')) as geldi,
    count(*) filter (where t.gun_r = g.gun and t.status = 'gelmedi') as gelmedi,
    count(*) filter (where t.gun_r = g.gun and t.status = 'iptal') as iptal,
    count(*) filter (where t.gun_r = g.gun and t.status = 'bekleniyor') as bekleyen
  from gunler g
  left join taban t on t.gun_r = g.gun
  group by g.gun
  order by g.gun;
$$;
