-- Kişi sayısının yanına kadın/erkek dağılımı (Gökhan, 2026-08-07) — yeni rezervasyon
-- alınırken opsiyonel olarak girilir, rezervasyon listesinde kişi sayısının yanında görünür.
alter table reservations add column if not exists kadin_sayisi integer;
alter table reservations add column if not exists erkek_sayisi integer;
