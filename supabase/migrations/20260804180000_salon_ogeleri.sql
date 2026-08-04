-- Salon planında masa dışındaki öğeler (Gökhan, 2026-08-04): duvar, bar, kolon, servis,
-- kapı. Rezervasyon/durum takibi YOK — bunlar sadece salonun gerçek halini çizmek için,
-- görsel. Duvar ve bar iki uçtan (x1,y1)-(x2,y2) çekilip uzatılabiliyor; kolon/servis/kapı
-- tek nokta (x1,y1), sabit boyda, sürüklenerek yerleştiriliyor (x2/y2 bunlarda hep null).
-- restaurant_tables'a KARIŞTIRILMADI — orası kapasite/rezervasyon hesabının kaynağı,
-- oraya dekoratif satır eklemek o hesapları bozardı.
create table salon_ogeleri (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  area_id       uuid not null references dining_areas(id),
  type          text not null check (type in ('duvar', 'bar', 'kolon', 'servis', 'kapi')),
  name          text not null,
  x1            numeric not null,
  y1            numeric not null,
  x2            numeric,
  y2            numeric,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index idx_salon_ogeleri_restaurant on salon_ogeleri(restaurant_id);
create index idx_salon_ogeleri_area on salon_ogeleri(area_id);
