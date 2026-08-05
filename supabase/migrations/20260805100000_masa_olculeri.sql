-- İşletmeye özel masa ölçüleri (Gökhan, 2026-08-05: "bu panel için bir sistem yapalım,
-- masa ölçülerini de girsinler ayarlardan"). Şekil × kişi sayısı grubu (2/4/6/8) başına
-- gerçek cm en/boy — girilmezse kod içindeki standart varsayılan kullanılır (fallback),
-- bu yüzden her kombinasyon için satır zorunlu değil.
create table masa_olculeri (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  shape         text not null check (shape in ('yuvarlak', 'kare', 'dikdortgen', 'loca')),
  seat_tier     integer not null check (seat_tier in (2, 4, 6, 8)),
  width_cm      numeric not null check (width_cm > 0),
  height_cm     numeric not null check (height_cm > 0),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, shape, seat_tier)
);
create index idx_masa_olculeri_restaurant on masa_olculeri(restaurant_id);
