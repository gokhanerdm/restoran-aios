-- GELENİN KADIN/ERKEK SAYISI (Gökhan, 2026-08-24)
--
-- kadin_sayisi / erkek_sayisi rezervasyon alınırken SÖYLENEN dağılım. Bu iki alan ise kapıda
-- GERÇEKLEŞEN dağılım: "Geldi" düğmesine basılınca program soruyor. Pax sütunu rezervasyondaki
-- sayıyı göstermeye devam ediyor, yeni "Gelen" sütunu gerçekleşeni gösteriyor.
alter table public.reservations
  add column if not exists gelen_kadin integer,
  add column if not exists gelen_erkek integer;
