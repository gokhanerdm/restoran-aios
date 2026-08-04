-- Dikdörtgen masalar çevrilebilsin (Gökhan, 2026-08-04) — duvara dayalı masa yatay/dikey
-- durabilir. Sadece dikdörtgen şekilde anlamlı (yuvarlak/kare döndürülünce aynı görünür).
alter table restaurant_tables add column if not exists rotated boolean not null default false;
