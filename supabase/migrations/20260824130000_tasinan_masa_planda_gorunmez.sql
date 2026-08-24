-- TAŞINAN MASA PLANDA GÖRÜNMEZ (Gökhan, 2026-08-24)
--
-- Masa hesabında sınırı aşan rezervasyona ikinci masa gerekiyor. Eski yol: depodan S1/S2 diye
-- yeni masa üretilip salona çiziliyordu. Yeni yol (Gökhan): ek masa önce ayarlardaki masa
-- kapasitesinden düşülür, salonda hiçbir şey çizilmez — masanın üstünde 6 kişi yazdığı için
-- işletme orada iki masa olduğunu zaten anlar. Kapasite bitince ek masa arka sıradan alınır ve
-- o masa planından kaybolur: fiilen kaldırılıp öne taşınmıştır.
alter table public.restaurant_tables
  add column if not exists tasindi_gun date;
